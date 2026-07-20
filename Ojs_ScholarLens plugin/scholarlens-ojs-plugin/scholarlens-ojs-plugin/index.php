<?php

/**
 * index.php
 *
 * Required entry point for all OJS Generic Plugins.
 * OJS loads this file to discover and instantiate the plugin class.
 *
 * Directory: plugins/generic/scholarlens/index.php
 */

require_once('ScholarLensPlugin.php');

return new APP\plugins\generic\scholarlens\ScholarLensPlugin();
