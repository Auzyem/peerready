<?php

/**
 * PeerReadySettingsForm.php
 *
 * Admin settings form for the PeerReady OJS Plugin.
 * Accessible via Settings > Website > Plugins > PeerReady > Settings.
 *
 * Fields:
 *   peerreadyApiUrl   — Base URL of the PeerReady deployment, e.g. https://peerready.app
 *   peerreadyApiKey   — API key for server-to-server authentication (Bearer token)
 *   peerreadyAutoMode — Whether to trigger automatically on every submission (boolean)
 *
 * Directory: plugins/generic/peerready/PeerReadySettingsForm.php
 */

namespace APP\plugins\generic\peerready;

use PKP\form\Form;

class PeerReadySettingsForm extends Form
{
    /** @var int The journal context ID */
    private int $contextId;

    /** @var PeerReadyPlugin */
    private PeerReadyPlugin $plugin;

    public function __construct(PeerReadyPlugin $plugin, int $contextId)
    {
        $this->plugin    = $plugin;
        $this->contextId = $contextId;

        parent::__construct($plugin->getTemplateResource('settingsForm.tpl'));

        // Validation rules
        $this->addCheck(
            new \FormValidatorURL($this, 'peerreadyApiUrl', 'required', 'plugins.generic.peerready.settings.apiUrlRequired')
        );
        $this->addCheck(
            new \FormValidator($this, 'peerreadyApiKey', 'required', 'plugins.generic.peerready.settings.apiKeyRequired')
        );
        $this->addCheck(new \FormValidatorPost($this));
        $this->addCheck(new \FormValidatorCSRF($this));
    }

    /**
     * Load saved settings into the form.
     */
    public function initData(): void
    {
        $this->setData('peerreadyApiUrl',   $this->plugin->getSetting($this->contextId, 'peerreadyApiUrl'));
        $this->setData('peerreadyApiKey',   $this->plugin->getSetting($this->contextId, 'peerreadyApiKey'));
        $this->setData('peerreadyAutoMode', $this->plugin->getSetting($this->contextId, 'peerreadyAutoMode') ?? true);
    }

    /**
     * Read form POST data.
     */
    public function readInputData(): void
    {
        $this->readUserVars(['peerreadyApiUrl', 'peerreadyApiKey', 'peerreadyAutoMode']);
    }

    /**
     * Save settings to the database.
     */
    public function execute(...$functionArgs): mixed
    {
        $this->plugin->updateSetting($this->contextId, 'peerreadyApiUrl',   $this->getData('peerreadyApiUrl'),   'string');
        $this->plugin->updateSetting($this->contextId, 'peerreadyApiKey',   $this->getData('peerreadyApiKey'),   'string');
        $this->plugin->updateSetting($this->contextId, 'peerreadyAutoMode', (bool) $this->getData('peerreadyAutoMode'), 'bool');

        return parent::execute(...$functionArgs);
    }
}
