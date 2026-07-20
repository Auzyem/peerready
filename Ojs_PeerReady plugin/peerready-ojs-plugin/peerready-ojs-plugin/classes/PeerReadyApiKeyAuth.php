<?php

/**
 * ScholarLensApiKeyAuth.php
 *
 * Middleware for validating API key authentication on the
 * ScholarLens callback endpoint (/api/v1/peerready/review-complete/*).
 *
 * ScholarLens sends: Authorization: Bearer <apiKey>
 * This middleware compares it to the key stored in the plugin settings.
 *
 * Usage — add to ScholarLensApiHandler before processing any callback:
 *
 *   use APP\plugins\generic\peerready\classes\ScholarLensApiKeyAuth;
 *
 *   $auth = new ScholarLensApiKeyAuth($contextId);
 *   if (!$auth->validate($request->getHeaderLine('Authorization'))) {
 *       return $response->withStatus(401)->withJson(['error' => 'Unauthorized']);
 *   }
 *
 * Directory: plugins/generic/peerready/classes/ScholarLensApiKeyAuth.php
 */

namespace APP\plugins\generic\peerready\classes;

use PKP\plugins\PluginRegistry;

class ScholarLensApiKeyAuth
{
    private int $contextId;

    public function __construct(int $contextId)
    {
        $this->contextId = $contextId;
    }

    /**
     * Validates the Authorization header against the stored API key.
     *
     * Uses hash_equals() for timing-safe comparison to prevent timing attacks.
     *
     * @param  string  $authorizationHeader  The full Authorization header value
     * @return bool
     */
    public function validate(string $authorizationHeader): bool
    {
        $token = trim(str_replace('Bearer', '', $authorizationHeader));

        if (empty($token)) {
            return false;
        }

        $plugin     = PluginRegistry::getPlugin('generic', 'peerreadyplugin');
        $storedKey  = $plugin ? $plugin->getSetting($this->contextId, 'peerreadyApiKey') : null;

        if (empty($storedKey)) {
            return false;
        }

        return hash_equals($storedKey, $token);
    }
}
