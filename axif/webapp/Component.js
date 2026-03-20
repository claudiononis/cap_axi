sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "axi/axif/model/models"
], (UIComponent, JSONModel, models) => {
    "use strict";

    return UIComponent.extend("axi.axif.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");
            this._setMockModel("methods", "model/mock/methods.json");
            this._setMockModel("indexes", "model/mock/indexes.json");
            this._setMockModel("companyCodes", "model/mock/companyCodes.json");
            this._setMockModel("accounts", "model/mock/accounts.json");
            this._setMockModel("runs", "model/mock/runs.json");

            // enable routing
            this.getRouter().initialize();
        },

        _setMockModel(sName, sRelativePath) {
            const oModel = new JSONModel();

            oModel.setSizeLimit(200);
            oModel.loadData(sap.ui.require.toUrl(`axi/axif/${sRelativePath}`));
            this.setModel(oModel, sName);
        }
    });
});
