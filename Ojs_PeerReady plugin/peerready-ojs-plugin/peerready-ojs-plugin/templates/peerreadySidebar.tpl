{**
 * peerreadySidebar.tpl
 *
 * Smarty template rendered in the OJS submission workflow sidebar.
 * Shows the PeerReady review status badge and a "View Report" button.
 *
 * Template variables (set by PeerReadyPlugin::injectWorkflowButton):
 *   $peerreadyStatus      — 'pending' | 'reviewing' | 'complete' | 'failed'
 *   $peerreadySessionId   — PeerReady session UUID
 *   $peerreadyReportUrl   — Full URL to the PeerReady review dashboard
 *   $peerreadyStatusUrl   — OJS API endpoint for live status polling
 *
 * Directory: plugins/generic/peerready/templates/peerreadySidebar.tpl
 **}

<div class="pkp_workflow_sidebar_block peerready-sidebar-block" id="peerready-block">
    <h3 class="pkp_workflow_sidebar_block_header">
        {translate key="plugins.generic.peerready.sidebarTitle"}
    </h3>

    <div class="peerready-status-wrap">

        {* ── Status badge ────────────────────────────────────────────────── *}
        <div class="peerready-status-badge peerready-status-{$peerreadyStatus|escape}"
             id="peerready-status-badge">
            {if $peerreadyStatus === 'pending'}
                <span class="peerready-dot"></span>
                {translate key="plugins.generic.peerready.status.pending"}
            {elseif $peerreadyStatus === 'reviewing'}
                <span class="peerready-dot peerready-dot--pulse"></span>
                {translate key="plugins.generic.peerready.status.reviewing"}
            {elseif $peerreadyStatus === 'complete'}
                <span class="peerready-dot peerready-dot--done"></span>
                {translate key="plugins.generic.peerready.status.complete"}
            {elseif $peerreadyStatus === 'failed'}
                <span class="peerready-dot peerready-dot--fail"></span>
                {translate key="plugins.generic.peerready.status.failed"}
            {/if}
        </div>

        {* ── View report button (shown only when complete) ───────────────── *}
        {if $peerreadyStatus === 'complete' && $peerreadyReportUrl}
            <a href="{$peerreadyReportUrl|escape}"
               target="_blank"
               rel="noopener noreferrer"
               class="pkp_button peerready-view-btn">
                {translate key="plugins.generic.peerready.viewReport"}
                <span class="peerready-icon-external">&#8599;</span>
            </a>
        {/if}

        {* ── Session ID (small, for editorial reference) ─────────────────── *}
        {if $peerreadySessionId}
            <p class="peerready-session-id">
                {translate key="plugins.generic.peerready.sessionId"}:
                <code>{$peerreadySessionId|escape|truncate:12:"…":true}</code>
            </p>
        {/if}

    </div>
</div>

{* ── Live polling script — refreshes the status badge every 20 seconds while reviewing *}
{if $peerreadyStatus === 'pending' || $peerreadyStatus === 'reviewing'}
<script>
(function () {
    var statusUrl  = '{$peerreadyStatusUrl|escape:"javascript"}';
    var badge      = document.getElementById('peerready-status-badge');
    var pollHandle = null;

    var labels = {
        pending:   '{translate key="plugins.generic.peerready.status.pending"|escape:"javascript"}',
        reviewing: '{translate key="plugins.generic.peerready.status.reviewing"|escape:"javascript"}',
        complete:  '{translate key="plugins.generic.peerready.status.complete"|escape:"javascript"}',
        failed:    '{translate key="plugins.generic.peerready.status.failed"|escape:"javascript"}'
    };

    function poll() {
        fetch(statusUrl, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                badge.className = 'peerready-status-badge peerready-status-' + data.status;
                badge.innerHTML = '<span class="peerready-dot' +
                    (data.status === 'reviewing' ? ' peerready-dot--pulse' : '') +
                    (data.status === 'complete'  ? ' peerready-dot--done'  : '') +
                    (data.status === 'failed'    ? ' peerready-dot--fail'  : '') +
                    '"></span>' + (labels[data.status] || data.status);

                // If review is done reload the page to show the report button
                if (data.status === 'complete' || data.status === 'failed') {
                    clearInterval(pollHandle);
                    setTimeout(function () { window.location.reload(); }, 1500);
                }
            })
            .catch(function (err) {
                console.warn('[PeerReady] Status poll error:', err);
            });
    }

    // Start polling every 20 seconds
    pollHandle = setInterval(poll, 20000);
}());
</script>
{/if}
