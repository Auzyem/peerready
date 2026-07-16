<?php

/**
 * PeerReadyApiHandler.php
 *
 * REST API handler for PeerReady callbacks into OJS.
 *
 * Endpoints exposed:
 *
 *   POST /index.php/{contextPath}/api/v1/peerready/review-complete/{submissionId}
 *     Called by PeerReady when the AI review pipeline completes.
 *     Body (JSON):
 *       sessionId    string  — PeerReady review session ID
 *       verdict      string  — 'accept' | 'minor_revision' | 'major_revision' | 'reject'
 *       overallScore int     — Total score (0-80 for 8-dimension rubric)
 *       summaryNote  string  — Plain-text summary for editorial note
 *       reportUrl    string  — URL to the full PeerReady review dashboard
 *     Response: 200 {"ok": true}
 *
 *   GET /index.php/{contextPath}/api/v1/peerready/status/{submissionId}
 *     Returns the current PeerReady review status for a submission.
 *     Used by the OJS sidebar button to show live status.
 *     Response: 200 {"status": "reviewing"|"complete"|"failed", "sessionId": "...", "reportUrl": "..."}
 *
 * Directory: plugins/generic/peerready/api/v1/peerready/PeerReadyApiHandler.php
 *
 * Security:
 *   review-complete: validates a shared webhook secret in the Authorization header.
 *   status: requires an authenticated OJS editor or admin session.
 */

namespace APP\plugins\generic\peerready\api\v1\peerready;

use PKP\handler\APIHandler;
use PKP\security\authorization\ContextAccessPolicy;
use Slim\Http\Request;
use Slim\Http\Response;

class PeerReadyApiHandler extends APIHandler
{
    public function __construct()
    {
        $this->_handlerPath = 'peerready';

        // Route definitions for Slim router
        $this->_routes = [
            'post' => [
                ['review-complete/{submissionId}', [$this, 'reviewComplete']],
            ],
            'get' => [
                ['status/{submissionId}', [$this, 'getStatus']],
            ],
        ];

        parent::__construct();
    }

    public function authorize($request, &$args, $roleAssignments): bool
    {
        // Context-level access — any journal editor or above
        $this->addPolicy(new ContextAccessPolicy($request, $roleAssignments));
        return parent::authorize($request, $args, $roleAssignments);
    }

    // ─────────────────────────────────────────────
    // POST /api/v1/peerready/review-complete/{submissionId}
    // ─────────────────────────────────────────────

    /**
     * PeerReady posts here when the review pipeline completes.
     *
     * Validates the webhook secret, then:
     *  - Updates the OJS submission settings (status, verdict, score)
     *  - Creates an editorial discussion note with the review summary
     *  - Sends an email notification to the editor
     */
    public function reviewComplete(Request $slimRequest, Response $response, array $args): Response
    {
        $submissionId = (int) ($args['submissionId'] ?? 0);

        // ── Validate webhook secret ───────────────────────────────────────────
        $authHeader = $slimRequest->getHeaderLine('Authorization');
        $token      = str_replace('Bearer ', '', $authHeader);

        $submissionDao = \DAORegistry::getDAO('SubmissionDAO');
        $submission    = $submissionDao->getById($submissionId);

        if (!$submission) {
            return $response->withStatus(404)->withJson(['error' => 'Submission not found']);
        }

        $plugin     = \PluginRegistry::getPlugin('generic', 'peerreadyplugin');
        $contextId  = $submission->getData('contextId');
        $expectedKey = $plugin ? $plugin->getSetting($contextId, 'peerreadyApiKey') : null;

        if (!$expectedKey || !hash_equals($expectedKey, $token)) {
            return $response->withStatus(401)->withJson(['error' => 'Unauthorized']);
        }

        // ── Parse request body ────────────────────────────────────────────────
        $body        = $slimRequest->getParsedBody();
        $sessionId   = $body['sessionId']    ?? '';
        $verdict     = $body['verdict']      ?? '';
        $score       = (int) ($body['overallScore'] ?? 0);
        $summaryNote = $body['summaryNote']  ?? '';
        $reportUrl   = $body['reportUrl']    ?? '';

        if (!$sessionId) {
            return $response->withStatus(400)->withJson(['error' => 'Missing sessionId']);
        }

        // ── Update submission settings in OJS ─────────────────────────────────
        $submissionDao->updateSetting($submissionId, 'peerreadyStatus',  'complete', 'string');
        $submissionDao->updateSetting($submissionId, 'peerreadyVerdict', $verdict,   'string');
        $submissionDao->updateSetting($submissionId, 'peerreadyScore',   $score,     'int');

        // ── Create an editorial discussion note ───────────────────────────────
        $this->createDiscussionNote($submission, $summaryNote, $verdict, $score, $reportUrl);

        // ── Notify the assigned editor ────────────────────────────────────────
        $this->notifyEditor($submission, $verdict, $score, $reportUrl);

        return $response->withStatus(200)->withJson(['ok' => true]);
    }

    // ─────────────────────────────────────────────
    // GET /api/v1/peerready/status/{submissionId}
    // ─────────────────────────────────────────────

    /**
     * Returns the current PeerReady review status for the OJS sidebar.
     */
    public function getStatus(Request $slimRequest, Response $response, array $args): Response
    {
        $submissionId  = (int) ($args['submissionId'] ?? 0);
        $submissionDao = \DAORegistry::getDAO('SubmissionDAO');

        $status    = $submissionDao->getSetting($submissionId, 'peerreadyStatus');
        $sessionId = $submissionDao->getSetting($submissionId, 'peerreadySessionId');
        $verdict   = $submissionDao->getSetting($submissionId, 'peerreadyVerdict');
        $score     = $submissionDao->getSetting($submissionId, 'peerreadyScore');
        $apiBase   = $submissionDao->getSetting($submissionId, 'peerreadyApiBase');

        $reportUrl = $sessionId && $apiBase
            ? rtrim($apiBase, '/') . '/manuscripts/review/' . $sessionId
            : null;

        return $response->withStatus(200)->withJson([
            'status'    => $status    ?? 'pending',
            'sessionId' => $sessionId ?? null,
            'verdict'   => $verdict   ?? null,
            'score'     => $score     ?? null,
            'reportUrl' => $reportUrl,
        ]);
    }

    // ─────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────

    /**
     * Creates an internal OJS editorial discussion note with the PeerReady summary.
     * The note appears in the Submission workflow > Review stage > Discussions panel.
     */
    private function createDiscussionNote($submission, string $summaryNote, string $verdict, int $score, string $reportUrl): void
    {
        try {
            $request = \Application::get()->getRequest();

            // Format the note body
            $verdictLabels = [
                'accept'          => 'Accept',
                'minor_revision'  => 'Minor Revision',
                'major_revision'  => 'Major Revision',
                'reject'          => 'Reject',
            ];
            $verdictLabel = $verdictLabels[$verdict] ?? ucfirst($verdict);

            $noteBody = "PeerReady AI Review completed.\n\n"
                . "Verdict: {$verdictLabel}\n"
                . "Overall Score: {$score}/80\n\n"
                . $summaryNote . "\n\n"
                . "Full review report: " . $reportUrl;

            // Use OJS Query/Note DAO to create the discussion note
            $queryDao = \DAORegistry::getDAO('QueryDAO');
            $query    = $queryDao->newDataObject();
            $query->setAssocType(ASSOC_TYPE_SUBMISSION);
            $query->setAssocId($submission->getId());
            $query->setStageId(WORKFLOW_STAGE_ID_EXTERNAL_REVIEW);
            $query->setSequence(REALLY_BIG_NUMBER);
            $query->setIsClosed(false);
            $queryId = $queryDao->insertObject($query);
            $queryDao->resequence(ASSOC_TYPE_SUBMISSION, $submission->getId());

            $noteDao = \DAORegistry::getDAO('NoteDAO');
            $note    = $noteDao->newDataObject();
            $note->setAssocType(ASSOC_TYPE_QUERY);
            $note->setAssocId($queryId);
            $note->setUserId($request->getUser() ? $request->getUser()->getId() : 1);
            $note->setDateCreated(\Core::getCurrentDate());
            $note->setDateModified(\Core::getCurrentDate());
            $note->setTitle('PeerReady AI Review — ' . $verdictLabel);
            $note->setContents($noteBody);
            $noteDao->insertObject($note);
        } catch (\Throwable $e) {
            error_log('[PeerReady] Failed to create discussion note: ' . $e->getMessage());
        }
    }

    /**
     * Notifies the assigned editor by email that the PeerReady review is complete.
     */
    private function notifyEditor($submission, string $verdict, int $score, string $reportUrl): void
    {
        try {
            // Get editors assigned to this submission
            $stageAssignmentDao = \DAORegistry::getDAO('StageAssignmentDAO');
            $editorAssignments  = $stageAssignmentDao->getBySubmissionAndStageId(
                $submission->getId(),
                WORKFLOW_STAGE_ID_EXTERNAL_REVIEW
            );

            $userDao = \DAORegistry::getDAO('UserDAO');

            $verdictLabels = [
                'accept'         => 'Accept',
                'minor_revision' => 'Minor Revision',
                'major_revision' => 'Major Revision',
                'reject'         => 'Reject',
            ];
            $verdictLabel = $verdictLabels[$verdict] ?? ucfirst($verdict);

            while ($assignment = $editorAssignments->next()) {
                $editor = $userDao->getById($assignment->getUserId());
                if (!$editor) {
                    continue;
                }

                $mail = new \MailTemplate('PEERREADY_REVIEW_COMPLETE');
                $mail->setReplyTo(null);
                $mail->addRecipient($editor->getEmail(), $editor->getFullName());
                $mail->assignParams([
                    'editorName'   => $editor->getFullName(),
                    'submissionId' => $submission->getId(),
                    'title'        => $submission->getCurrentPublication()->getLocalizedTitle(),
                    'verdict'      => $verdictLabel,
                    'score'        => $score,
                    'reportUrl'    => $reportUrl,
                ]);
                $mail->send();
            }
        } catch (\Throwable $e) {
            error_log('[PeerReady] Failed to send editor notification: ' . $e->getMessage());
        }
    }
}
