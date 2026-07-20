{**
 * scholarlensSidebar.tpl
 *
 * Smarty template rendered in the OJS submission workflow sidebar.
 * Shows the ScholarLens review status badge and a "View Report" button.
 *
 * Template variables (set by ScholarLensPlugin::injectWorkflowButton):
 *   $scholarlensStatus      — 'pending' | 'reviewing' | 'complete' | 'failed'
 *   $scholarlensSessionId   — ScholarLens session UUID
 *   $scholarlensReportUrl   — Full URL to the ScholarLens review dashboard
 *   $scholarlensStatusUrl   — OJS API endpoint for live status polling
 *
 * Directory: plugins/generic/scholarlens/templates/scholarlensSidebar.tpl
 **}

<div class="pkp_workflow_sidebar_block scholarlens-sidebar-block" id="scholarlens-block">
    <h3 class="pkp_workflow_sidebar_block_header">
        {translate key="plugins.generic.scholarlens.sidebarTitle"}
    </h3>

    <div class="scholarlens-status-wrap">

        {* ── Status badge ────────────────────────────────────────────────── *}
        <div class="scholarlens-status-badge scholarlens-status-{$scholarlensStatus|escape}"
             id="scholarlens-status-badge">
            {if $scholarlensStatus === 'pending'}
                <span class="scholarlens-dot"></span>
                {translate key="plugins.generic.scholarlens.status.pending"}
            {elseif $scholarlensStatus === 'reviewing'}
                <span class="scholarlens-dot scholarlens-dot--pulse"></span>
                {translate key="plugins.generic.scholarlens.status.reviewing"}
            {elseif $scholarlensStatus === 'complete'}
                <span class="scholarlens-dot scholarlens-dot--done"></span>
                {translate key="plugins.generic.scholarlens.status.complete"}
            {elseif $scholarlensStatus === 'failed'}
                <span class="scholarlens-dot scholarlens-dot--fail"></span>
                {translate key="plugins.generic.scholarlens.status.failed"}
            {/if}
        </div>

        {* ── View report button (shown only when complete) ───────────────── *}
        {if $scholarlensStatus === 'complete' && $scholarlensReportUrl}
            <a href="{$scholarlensReportUrl|escape}"
               target="_blank"
               rel="noopener noreferrer"
               class="pkp_button scholarlens-view-btn">
                {translate key="plugins.generic.scholarlens.viewReport"}
                <span class="scholarlens-icon-external">&#8599;</span>
            </a>
        {/if}

        {* ── Session ID (small, for editorial reference) ─────────────────── *}
        {if $scholarlensSessionId}
            <p class="scholarlens-session-id">
                {translate key="plugins.generic.scholarlens.sessionId"}:
                <code>{$scholarlensSessionId|escape|truncate:12:"…":true}</code>
            </p>
        {/if}

    </div>
</div>

{* ── Live polling script — refreshes the status badge every 20 seconds while reviewing *}
{if $scholarlensStatus === 'pending' || $scholarlensStatus === 'reviewing'}
<script>
(function () {
    var statusUrl  = '{$scholarlensStatusUrl|escape:"javascript"}';
    var badge      = document.getElementById('scholarlens-status-badge');
    var pollHandle = null;

    var labels = {
        pending:   '{translate key="plugins.generic.scholarlens.status.pending"|escape:"javascript"}',
        reviewing: '{translate key="plugins.generic.scholarlens.status.reviewing"|escape:"javascript"}',
        complete:  '{translate key="plugins.generic.scholarlens.status.complete"|escape:"javascript"}',
        failed:    '{translate key="plugins.generic.scholarlens.status.failed"|escape:"javascript"}'
    };

    function poll() {
        fetch(statusUrl, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                badge.className = 'scholarlens-status-badge scholarlens-status-' + data.status;
                badge.innerHTML = '<span class="scholarlens-dot' +
                    (data.status === 'reviewing' ? ' scholarlens-dot--pulse' : '') +
                    (data.status === 'complete'  ? ' scholarlens-dot--done'  : '') +
                    (data.status === 'failed'    ? ' scholarlens-dot--fail'  : '') +
                    '"></span>' + (labels[data.status] || data.status);

                // If review is done reload the page to show the report button
                if (data.status === 'complete' || data.status === 'failed') {
                    clearInterval(pollHandle);
                    setTimeout(function () { window.location.reload(); }, 1500);
                }
            })
            .catch(function (err) {
                console.warn('[ScholarLens] Status poll error:', err);
            });
    }

    // Start polling every 20 seconds
    pollHandle = setInterval(poll, 20000);
}());
</script>
{/if}
