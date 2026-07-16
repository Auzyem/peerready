{**
 * settingsForm.tpl
 *
 * Admin settings form for the PeerReady OJS Plugin.
 * Shown in Settings > Website > Plugins > PeerReady > Settings.
 *
 * Directory: plugins/generic/peerready/templates/settingsForm.tpl
 **}

<script>
    $(function() {
        $('#peerreadySettingsForm').pkpHandler('$.pkp.controllers.form.AjaxFormHandler');
    });
</script>

<form class="pkp_form" id="peerreadySettingsForm" method="post"
      action="{url router=$smarty.const.ROUTE_COMPONENT op="manage"
               category="generic" plugin=$pluginName verb="settings" save=true}">

    {csrf}

    {include file="controllers/notification/inPlaceNotification.tpl"
             notificationId="peerreadySettingsNotification"}

    {fbvFormArea id="peerreadySettings"}

        {fbvFormSection title="plugins.generic.peerready.settings.apiSection"
                        description="plugins.generic.peerready.settings.apiSectionDescription"
                        list=true}

            {* PeerReady base URL *}
            {fbvElement type="text"
                        id="peerreadyApiUrl"
                        value=$peerreadyApiUrl
                        label="plugins.generic.peerready.settings.apiUrl"
                        description="plugins.generic.peerready.settings.apiUrlDescription"
                        maxlength="255"
                        required=true}

            {* API key / Bearer token *}
            {fbvElement type="text"
                        id="peerreadyApiKey"
                        value=$peerreadyApiKey
                        label="plugins.generic.peerready.settings.apiKey"
                        description="plugins.generic.peerready.settings.apiKeyDescriptionV2"
                        maxlength="255"
                        required=true
                        class="pkp_form_password"}

            {* Auto-trigger toggle *}
            {fbvElement type="checkbox"
                        id="peerreadyAutoMode"
                        checked=$peerreadyAutoMode
                        label="plugins.generic.peerready.settings.autoMode"
                        description="plugins.generic.peerready.settings.autoModeDescription"}

        {/fbvFormSection}

        {* Connection test (triggered client-side) *}
        {fbvFormSection}
            <div class="peerready-test-wrap">
                <button type="button" id="peerready-test-btn" class="pkp_button">
                    {translate key="plugins.generic.peerready.settings.testConnection"}
                </button>
                <span id="peerready-test-result" class="peerready-test-result"></span>
            </div>
        {/fbvFormSection}

    {/fbvFormArea}

    {fbvFormButtons}

</form>

<script>
document.getElementById('peerready-test-btn').addEventListener('click', function () {
    var btn    = this;
    var result = document.getElementById('peerready-test-result');
    var url    = document.getElementById('peerreadyApiUrl').value.trim();
    var key    = document.getElementById('peerreadyApiKey').value.trim();

    if (!url || !key) {
        result.textContent = '{translate key="plugins.generic.peerready.settings.testMissingFields"|escape:"javascript"}';
        result.className   = 'peerready-test-result peerready-test-fail';
        return;
    }

    btn.disabled   = true;
    result.textContent = '{translate key="plugins.generic.peerready.settings.testTesting"|escape:"javascript"}';
    result.className   = 'peerready-test-result';

    fetch(url + '/api/billing/current', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + key }
    })
    .then(function (r) {
        if (r.ok) {
            result.textContent = '{translate key="plugins.generic.peerready.settings.testSuccess"|escape:"javascript"}';
            result.className   = 'peerready-test-result peerready-test-ok';
        } else {
            result.textContent = '{translate key="plugins.generic.peerready.settings.testFailed"|escape:"javascript"}' + ' (' + r.status + ')';
            result.className   = 'peerready-test-result peerready-test-fail';
        }
        btn.disabled = false;
    })
    .catch(function (err) {
        result.textContent = '{translate key="plugins.generic.peerready.settings.testError"|escape:"javascript"}' + ' ' + err.message;
        result.className   = 'peerready-test-result peerready-test-fail';
        btn.disabled       = false;
    });
});
</script>
