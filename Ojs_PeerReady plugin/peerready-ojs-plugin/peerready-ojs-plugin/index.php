<?php

/**
 * index.php
 *
 * Required entry point for all OJS Generic Plugins.
 * OJS loads this file to discover and instantiate the plugin class.
 *
 * Directory: plugins/generic/peerready/index.php
 */

require_once('PeerReadyPlugin.php');

return new APP\plugins\generic\peerready\PeerReadyPlugin();
