<?php

/**
 * PeerReadyPlugin.php
 *
 * PeerReady AI Manuscript Review — OJS Generic Plugin
 * Compatible with OJS 3.3.x and OJS 3.4.x
 *
 * Architecture: Option A (webhook bridge)
 *   1. Hook fires when a new submission is submitted.
 *   2. Plugin POSTs the manuscript file + metadata to PeerReady /api/upload.
 *   3. Plugin stores the PeerReady session_id against the OJS submission.
 *   4. PeerReady calls back to /api/v1/peerready/review-complete when done.
 *   5. Plugin attaches a discussion note and a sidebar link in OJS.
 *
 * Directory: plugins/generic/peerready/
 */

namespace APP\plugins\generic\peerready;

use PKP\plugins\GenericPlugin;
use PKP\plugins\PluginRegistry;
use PKP\core\PKPApplication;
use PKP\db\DAORegistry;
use APP\core\Application;

class PeerReadyPlugin extends GenericPlugin
{
    // ─────────────────────────────────────────────
    // Plugin identity
    // ─────────────────────────────────────────────

    public function getDisplayName(): string
    {
        return __('plugins.generic.peerready.displayName');
    }

    public function getDescription(): string
    {
        return __('plugins.generic.peerready.description');
    }

    // ─────────────────────────────────────────────
    // Registration — called by OJS on every request
    // ─────────────────────────────────────────────

    public function register($category, $path, $mainContextId = null): bool
    {
        $success = parent::register($category, $path, $mainContextId);

        if ($success && $this->getEnabled()) {

            // Hook 1: Fires when an author completes the final submission step.
            // OJS 3.3: 'submissionsubmitstep4form::execute'
            // OJS 3.4: 'Submission::add' (fires after the submission is persisted)
            \HookRegistry::register(
                'Submission::add',
                [$this, 'handleNewSubmission']
            );

            // Hook 2: Fires when OJS renders the submission workflow page.
            // Used to inject the "View PeerReady Report" button into the sidebar.
            \HookRegistry::register(
                'Template::Workflow',
                [$this, 'injectWorkflowButton']
            );

            // Hook 3: Register our custom REST API endpoint.
            // PeerReady calls POST /api/v1/peerready/review-complete when done.
            \HookRegistry::register(
                'LoadHandler',
                [$this, 'registerApiHandler']
            );
        }

        return $success;
    }

    // ─────────────────────────────────────────────
    // Hook 1: New submission — trigger PeerReady review
    // ─────────────────────────────────────────────

    /**
     * Called when a new submission is added to OJS.
     *
     * @param string $hookName
     * @param array  $args  [0] => Submission object
     * @return bool  false = allow other hooks to continue
     */
    public function handleNewSubmission(string $hookName, array $args): bool
    {
        $submission = $args[0];

        // Only proceed for submitted (not draft) manuscripts
        if ($submission->getData('submissionProgress') !== '') {
            return false;
        }

        try {
            $this->sendToPeerReady($submission);
        } catch (\Throwable $e) {
            // Log but do not block OJS submission process
            error_log('[PeerReady] handleNewSubmission error: ' . $e->getMessage());
        }

        return false; // false = let OJS continue normally
    }

    /**
     * Upload the manuscript file to PeerReady and start the review.
     *
     * @param  \APP\submission\Submission  $submission
     */
    private function sendToPeerReady($submission): void
    {
        $submissionId = $submission->getId();
        $apiBase      = $this->getSetting($submission->getData('contextId'), 'peerreadyApiUrl');
        $apiKey       = $this->getSetting($submission->getData('contextId'), 'peerreadyApiKey');

        if (empty($apiBase) || empty($apiKey)) {
            error_log('[PeerReady] Plugin not configured — skipping submission ' . $submissionId);
            return;
        }

        // ── Step 1: Get the primary submission file ──────────────────────────
        $submissionFileDao = \DAORegistry::getDAO('SubmissionFileDAO');
        /* @var \PKP\submissionFile\SubmissionFile[] $files */
        $files = $submissionFileDao->getBySubmissionId($submissionId);

        $primaryFile = null;
        foreach ($files as $file) {
            // SUBMISSION_FILE_SUBMISSION = 2 (the author's uploaded manuscript)
            if ($file->getFileStage() === SUBMISSION_FILE_SUBMISSION) {
                $primaryFile = $file;
                break;
            }
        }

        if (!$primaryFile) {
            error_log('[PeerReady] No primary submission file found for submission ' . $submissionId);
            return;
        }

        $filePath = $primaryFile->getData('path');
        $fileName = $primaryFile->getData('name', 'en');
        if (!$fileName) {
            $fileName = basename($filePath);
        }

        if (!file_exists($filePath)) {
            error_log('[PeerReady] File not found on disk: ' . $filePath);
            return;
        }

        // ── Step 2: Build metadata payload ───────────────────────────────────
        $publication = $submission->getCurrentPublication();
        $title       = $publication ? $publication->getLocalizedTitle() : '';
        $abstract    = $publication ? strip_tags($publication->getLocalizedData('abstract')) : '';

        // ── Step 3: Create a manuscript record in PeerReady ──────────────────
        $manuscriptResponse = $this->peerreadyPost(
            $apiBase . '/api/manuscripts',
            $apiKey,
            json_encode([
                'title'    => $title,
                'abstract' => $abstract,
            ]),
            'application/json'
        );

        if (!isset($manuscriptResponse['id'])) {
            error_log('[PeerReady] Failed to create manuscript: ' . json_encode($manuscriptResponse));
            return;
        }

        $manuscriptId = $manuscriptResponse['id'];

        // ── Step 4: Upload the file to PeerReady /api/upload ─────────────────
        $uploadResponse = $this->peerreadyPostFile(
            $apiBase . '/api/upload',
            $apiKey,
            $filePath,
            $fileName,
            $manuscriptId
        );

        if (!isset($uploadResponse['draft']['id'])) {
            error_log('[PeerReady] File upload failed: ' . json_encode($uploadResponse));
            return;
        }

        $draftId = $uploadResponse['draft']['id'];

        // ── Step 5: Start the review session ─────────────────────────────────
        $reviewResponse = $this->peerreadyPost(
            $apiBase . '/api/review/start',
            $apiKey,
            json_encode([
                'draftId'      => $draftId,
                'mode'         => 'standard',
                'callbackUrl'  => $this->buildCallbackUrl($submission->getData('contextId'), $submissionId),
            ]),
            'application/json'
        );

        if (!isset($reviewResponse['sessionId'])) {
            error_log('[PeerReady] Failed to start review: ' . json_encode($reviewResponse));
            return;
        }

        $sessionId = $reviewResponse['sessionId'];

        // ── Step 6: Store IDs in OJS submission settings ─────────────────────
        $submissionDao = \DAORegistry::getDAO('SubmissionDAO');
        $submissionDao->updateSetting($submissionId, 'peerreadySessionId',    $sessionId,    'string');
        $submissionDao->updateSetting($submissionId, 'peerreadyManuscriptId', $manuscriptId, 'string');
        $submissionDao->updateSetting($submissionId, 'peerreadyStatus',       'reviewing',   'string');
        $submissionDao->updateSetting($submissionId, 'peerreadyApiBase',      $apiBase,      'string');

        error_log('[PeerReady] Review started — submissionId=' . $submissionId . ' sessionId=' . $sessionId);
    }

    // ─────────────────────────────────────────────
    // Hook 2: Inject the "View PeerReady Report" button into workflow sidebar
    // ─────────────────────────────────────────────

    /**
     * Adds a "View PeerReady Report" button to the OJS submission workflow sidebar.
     *
     * @param string $hookName
     * @param array  $args  [0] => TemplateManager, [1] => template path
     * @return bool
     */
    public function injectWorkflowButton(string $hookName, array $args): bool
    {
        $templateMgr = $args[0];
        $template    = $args[1];

        // Only inject on the workflow page
        if ($template !== 'workflow/workflow.tpl') {
            return false;
        }

        $request      = Application::get()->getRequest();
        $submissionId = (int) $request->getUserVar('submissionId');

        if (!$submissionId) {
            return false;
        }

        $submissionDao = \DAORegistry::getDAO('SubmissionDAO');
        $sessionId     = $submissionDao->getSetting($submissionId, 'peerreadySessionId');
        $status        = $submissionDao->getSetting($submissionId, 'peerreadyStatus');
        $apiBase       = $submissionDao->getSetting($submissionId, 'peerreadyApiBase');

        if (!$sessionId) {
            return false;
        }

        // Build the PeerReady report URL
        $contextPath      = $request->getContext()->getPath();
        $reportUrl        = rtrim($apiBase ?? '', '/') . '/manuscripts/review/' . $sessionId;
        $callbackEndpoint = $request->getBaseUrl() . '/index.php/' . $contextPath . '/api/v1/peerready/status/' . $submissionId;

        $templateMgr->assign([
            'peerreadySessionId' => $sessionId,
            'peerreadyStatus'    => $status ?? 'pending',
            'peerreadyReportUrl' => $reportUrl,
            'peerreadyStatusUrl' => $callbackEndpoint,
        ]);

        $templateMgr->registerPlugin(
            'function',
            'peerready_button',
            [$this, 'smartyPeerReadyButton']
        );

        // Insert our sidebar partial into the workflow template
        $templateMgr->addStyleSheet(
            'peerreadyStyles',
            $request->getBaseUrl() . '/' . $this->getPluginPath() . '/styles/peerready.css',
            ['contexts' => 'backend']
        );

        return false;
    }

    /**
     * Smarty function to render the PeerReady button in the sidebar.
     */
    public function smartyPeerReadyButton(array $params, \Smarty_Internal_Template $smarty): string
    {
        return $smarty->fetch($this->getTemplateResource('peerreadySidebar.tpl'));
    }

    // ─────────────────────────────────────────────
    // Hook 3: Register the REST callback endpoint
    // ─────────────────────────────────────────────

    /**
     * Registers /api/v1/peerready/* so PeerReady can POST results back.
     *
     * @param string $hookName
     * @param array  $args  [0] => &$page, [1] => &$op, [2] => &$sourceFile
     * @return bool
     */
    public function registerApiHandler(string $hookName, array $args): bool
    {
        $page = $args[0];
        if ($page === 'api' && isset($args[1]) && $args[1] === 'v1') {
            // Let the PKP REST router pick it up via our ApiHandler class
            return false;
        }

        return false;
    }

    // ─────────────────────────────────────────────
    // Plugin settings (admin form)
    // ─────────────────────────────────────────────

    public function getActions($request, $actionArgs): array
    {
        $router = $request->getRouter();
        import('lib.pkp.classes.linkAction.request.AjaxModal');

        return array_merge(
            [
                new \LinkAction(
                    'settings',
                    new \AjaxModal(
                        $router->url($request, null, null, 'manage', null, [
                            'verb'   => 'settings',
                            'plugin' => $this->getName(),
                            'category' => 'generic',
                        ]),
                        $this->getDisplayName()
                    ),
                    __('manager.plugins.settings'),
                    null
                ),
            ],
            parent::getActions($request, $actionArgs)
        );
    }

    public function manage($args, $request): \JSONMessage
    {
        if ($request->getUserVar('verb') === 'settings') {
            $this->import('PeerReadySettingsForm');
            $form = new \PeerReadySettingsForm($this, $request->getContext()->getId());

            if ($request->getUserVar('save')) {
                $form->readInputData();
                if ($form->validate()) {
                    $form->execute();
                    return new \JSONMessage(true);
                }
            }

            $form->initData();
            return new \JSONMessage(true, $form->fetch($request));
        }

        return parent::manage($args, $request);
    }

    // ─────────────────────────────────────────────
    // HTTP helpers
    // ─────────────────────────────────────────────

    /**
     * POST JSON to PeerReady and return decoded response array.
     */
    private function peerreadyPost(
        string $url,
        string $apiKey,
        string $body,
        string $contentType = 'application/json'
    ): array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: ' . $contentType,
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($error) {
            throw new \RuntimeException('cURL error: ' . $error);
        }

        $decoded = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('JSON decode error (' . $httpCode . '): ' . substr($response, 0, 300));
        }

        return $decoded;
    }

    /**
     * POST a file + manuscriptId to PeerReady /api/upload using multipart form.
     */
    private function peerreadyPostFile(
        string $url,
        string $apiKey,
        string $filePath,
        string $fileName,
        string $manuscriptId
    ): array {
        $curlFile = new \CURLFile($filePath, mime_content_type($filePath), $fileName);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => [
                'file'         => $curlFile,
                'manuscriptId' => $manuscriptId,
            ],
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 120, // Large files may take time
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($error) {
            throw new \RuntimeException('cURL upload error: ' . $error);
        }

        $decoded = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Upload JSON decode error (' . $httpCode . '): ' . substr($response, 0, 300));
        }

        return $decoded;
    }

    // ─────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────

    /**
     * Build the callback URL PeerReady will POST to when review is complete.
     */
    private function buildCallbackUrl(int $contextId, int $submissionId): string
    {
        $request     = Application::get()->getRequest();
        $context     = \DAORegistry::getDAO('JournalDAO')->getById($contextId);
        $contextPath = $context ? $context->getPath() : 'index';

        return $request->getBaseUrl()
            . '/index.php/' . $contextPath
            . '/api/v1/peerready/review-complete/'
            . $submissionId;
    }
}
