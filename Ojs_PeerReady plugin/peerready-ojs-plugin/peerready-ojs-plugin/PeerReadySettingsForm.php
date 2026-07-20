<?php

/**
 * ScholarLensSettingsForm.php
 *
 * Admin settings form for the ScholarLens OJS Plugin.
 * Accessible via Settings > Website > Plugins > ScholarLens > Settings.
 *
 * Fields:
 *   scholarlensApiUrl   — Base URL of the ScholarLens deployment, e.g. https://scholarlens.ac
 *   scholarlensApiKey   — API key for server-to-server authentication (Bearer token)
 *   scholarlensAutoMode — Whether to trigger automatically on every submission (boolean)
 *
 * Directory: plugins/generic/scholarlens/ScholarLensSettingsForm.php
 */

namespace APP\plugins\generic\scholarlens;

use PKP\form\Form;

class ScholarLensSettingsForm extends Form
{
    /** @var int The journal context ID */
    private int $contextId;

    /** @var ScholarLensPlugin */
    private ScholarLensPlugin $plugin;

    public function __construct(ScholarLensPlugin $plugin, int $contextId)
    {
        $this->plugin    = $plugin;
        $this->contextId = $contextId;

        parent::__construct($plugin->getTemplateResource('settingsForm.tpl'));

        // Validation rules
        $this->addCheck(
            new \FormValidatorURL($this, 'scholarlensApiUrl', 'required', 'plugins.generic.scholarlens.settings.apiUrlRequired')
        );
        $this->addCheck(
            new \FormValidator($this, 'scholarlensApiKey', 'required', 'plugins.generic.scholarlens.settings.apiKeyRequired')
        );
        $this->addCheck(new \FormValidatorPost($this));
        $this->addCheck(new \FormValidatorCSRF($this));
    }

    /**
     * Load saved settings into the form.
     */
    public function initData(): void
    {
        $this->setData('scholarlensApiUrl',   $this->plugin->getSetting($this->contextId, 'scholarlensApiUrl'));
        $this->setData('scholarlensApiKey',   $this->plugin->getSetting($this->contextId, 'scholarlensApiKey'));
        $this->setData('scholarlensAutoMode', $this->plugin->getSetting($this->contextId, 'scholarlensAutoMode') ?? true);
    }

    /**
     * Read form POST data.
     */
    public function readInputData(): void
    {
        $this->readUserVars(['scholarlensApiUrl', 'scholarlensApiKey', 'scholarlensAutoMode']);
    }

    /**
     * Save settings to the database.
     */
    public function execute(...$functionArgs): mixed
    {
        $this->plugin->updateSetting($this->contextId, 'scholarlensApiUrl',   $this->getData('scholarlensApiUrl'),   'string');
        $this->plugin->updateSetting($this->contextId, 'scholarlensApiKey',   $this->getData('scholarlensApiKey'),   'string');
        $this->plugin->updateSetting($this->contextId, 'scholarlensAutoMode', (bool) $this->getData('scholarlensAutoMode'), 'bool');

        return parent::execute(...$functionArgs);
    }
}
