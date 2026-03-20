/*global QUnit*/

sap.ui.define([
	"axi/axif/controller/axi.controller"
], function (Controller) {
	"use strict";

	QUnit.module("axi Controller");

	QUnit.test("I should test the axi controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
