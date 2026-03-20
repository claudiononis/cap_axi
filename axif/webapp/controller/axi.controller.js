sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], (Controller, JSONModel) => {
    "use strict";

    return Controller.extend("axi.axif.controller.axi", {
        onInit() {
            this.getView().setModel(new JSONModel({
                selectedKey: "cockpit"
            }), "shell");

            this._oRouter = this.getOwnerComponent().getRouter();
            this._mRouteTargets = {
                home: "cockpit",
                cockpit: "cockpit",
                methods: "methods",
                indexes: "indexes",
                accounts: "accounts"
            };

            Object.keys(this._mRouteTargets).forEach((sRouteName) => {
                this._oRouter.getRoute(sRouteName).attachPatternMatched(this._onRouteMatched, this);
            });
        },

        onNavigateToCockpit() {
            this._oRouter.navTo("cockpit");
        },

        onNavigateToMethods() {
            this._oRouter.navTo("methods");
        },

        onNavigateToIndexes() {
            this._oRouter.navTo("indexes");
        },

        onNavigateToAccounts() {
            this._oRouter.navTo("accounts");
        },

        _onRouteMatched(oEvent) {
            const sRouteName = oEvent.getParameter("name");
            const sKey = this._mRouteTargets[sRouteName] || "cockpit";
            const oNavContainer = this.byId("moduleNav");
            const oTargetPage = this.byId(`${sKey}Module`);

            this.getView().getModel("shell").setProperty("/selectedKey", sKey);

            if (oNavContainer && oTargetPage && oNavContainer.getCurrentPage() !== oTargetPage) {
                oNavContainer.to(oTargetPage);
            }
        }
    });
});
