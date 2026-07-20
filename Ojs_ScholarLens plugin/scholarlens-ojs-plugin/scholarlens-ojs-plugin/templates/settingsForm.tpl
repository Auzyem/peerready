{**
 * settingsForm.tpl
 *
 * Admin settings form for the ScholarLens OJS Plugin.
 * Shown in Settings > Website > Plugins > ScholarLens > Settings.
 *
 * Directory: plugins/generic/scholarlens/templates/settingsForm.tpl
 **}

<script>
    $(function() {
        $('#scholarlensSettingsForm').pkpHandler('$.pkp.controllers.form.AjaxFormHandler');
    });
</script>

<form class="pkp_form" id="scholarlensSettingsForm" method="post"
      action="{url router=$smarty.const.ROUTE_COMPONENT op="manage"
               category="generic" plugin=$pluginName verb="settings" save=true}">

    {csrf}

    {include file="controllers/notification/inPlaceNotification.tpl"
             notificationId="scholarlensSettingsNotification"}

    {fbvFormArea id="scholarlensSettings"}

        {fbvFormSection title="plugins.generic.scholarlens.settings.apiSection"
                        description="plugins.generic.scholarlens.settings.apiSectionDescription"
                        list=true}

            {* ScholarLens base URL *}
            {fbvElement type="text"
                        id="scholarlensApiUrl"
                        value=$scholarlensApiUrl
                        label="plugins.generic.scholarlens.settings.apiUrl"
                        description="plugins.generic.scholarlens.settings.apiUrlDescription"
                        maxlength="255"
                        required=true}

            {* API key / Bearer token *}
            {fbvElement type="text"
                        id="scholarlensApiKey"
                        value=$scholarlensApiKey
                        label="plugins.generic.scholarlens.settings.apiKey"
                        description="plugins.generic.scholarlens.settings.apiKeyDescriptionV2"
                        maxlength="255"
                        required=true
                        class="pkp_form_password"}

            {* Auto-trigger toggle *}
            {fbvElement type="checkbox"
                        id="scholarlensAutoMode"
                        checked=$scholarlensAutoMode
                        label="plugins.generic.scholarlens.settings.autoMode"
                        description="plugins.generic.scholarlens.settings.autoModeDescription"}

        {/fbvFormSection}

        {* Connection test (triggered client-side) *}
        {fbvFormSection}
            <div class="scholarlens-test-wrap">
                <button type="button" id="scholarlens-test-btn" class="pkp_button">
                    {translate key="plugins.generic.scholarlens.settings.testConnection"}
                </button>
                <span id="scholarlens-test-result" class="scholarlens-test-result"></span>
            </div>
        {/fbvFormSection}

    {/fbvFormArea}

    {fbvFormButtons}

</form>

<script>
document.getElementById('scholarlens-test-btn').addEventListener('click', function () {
    var btn    = this;
    var result = document.getElementById('scholarlens-test-result');
    var url    = document.getElementById('scholarlensApiUrl').value.trim();
    var key    = document.getElementById('scholarlensApiKey').value.trim();

    if (!url || !key) {
        result.textContent = '{translate key="plugins.generic.scholarlens.settings.testMissingFields"|escape:"javascript"}';
        result.className   = 'scholarlens-test-result scholarlens-test-fail';
        return;
    }

    btn.disabled   = true;
    result.textContent = '{translate key="plugins.generic.scholarlens.settings.testTesting"|escape:"javascript"}';
    result.className   = 'scholarlens-test-result';

    fetch(url + '/api/billing/current', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + key }
    })
    .then(function (r) {
        if (r.ok) {
            result.textContent = '{translate key="plugins.generic.scholarlens.settings.testSuccess"|escape:"javascript"}';
            result.className   = 'scholarlens-test-result scholarlens-test-ok';
        } else {
            result.textContent = '{translate key="plugins.generic.scholarlens.settings.testFailed"|escape:"javascript"}' + ' (' + r.status + ')';
            result.className   = 'scholarlens-test-result scholarlens-test-fail';
        }
        btn.disabled = false;
    })
    .catch(function (err) {
        result.textContent = '{translate key="plugins.generic.scholarlens.settings.testError"|escape:"javascript"}' + ' ' + err.message;
        result.className   = 'scholarlens-test-result scholarlens-test-fail';
        btn.disabled       = false;
    });
});
</script>
