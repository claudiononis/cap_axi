/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"axi/axif/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
