sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "axi/axif/utils/validator"
], (Controller, JSONModel, MessageBox, MessageToast, validator) => {
    "use strict";

    return Controller.extend("axi.axif.controller.Accounts", {
        onInit() {
            this._oAccountsModel = this.getOwnerComponent().getModel("accounts");
            this._oAccountsServiceModel = this.getOwnerComponent().getModel("accountsService");
            this._oViewModel = new JSONModel(this._getDefaultViewState());
            this.getView().setModel(this._oViewModel, "accountsView");

            if (!this._oAccountsServiceModel) {
                return;
            }

            this._loadRulesFromService();
        },

        onRuleSelectionChange(oEvent) {
            const oSelectedItem = oEvent.getParameter("listItem");
            const sPath = oSelectedItem?.getBindingContext("accounts")?.getPath();

            if (!sPath) {
                return;
            }

            this._selectRuleByPath(sPath);
        },

        onNewRule() {
            this._oViewModel.setProperty("/previousSelectionPath", this._oViewModel.getProperty("/selectedRulePath"));
            this._oViewModel.setProperty("/selectedRulePath", "");
            this._oViewModel.setProperty("/draftRule", this._getEmptyRule());
            this._oViewModel.setProperty("/isEditMode", true);
            this._oViewModel.setProperty("/isNewRule", true);
        },

        onEditRule() {
            const sSelectedRulePath = this._oViewModel.getProperty("/selectedRulePath");
            const oSelectedRule = sSelectedRulePath ? this._clone(this._oAccountsModel.getProperty(sSelectedRulePath)) : null;

            if (!oSelectedRule) {
                MessageBox.warning("Seleccione una regla contable para editar.");
                return;
            }

            this._oViewModel.setProperty("/draftRule", oSelectedRule);
            this._oViewModel.setProperty("/isEditMode", true);
            this._oViewModel.setProperty("/isNewRule", false);
        },

        onSaveRule() {
            const oDraftRule = this._normalizeRule(this._clone(this._oViewModel.getProperty("/draftRule")));
            const aErrors = this._validateRule(oDraftRule);
            const bIsNewRule = this._oViewModel.getProperty("/isNewRule");
            const sRulePath = this._oViewModel.getProperty("/selectedRulePath");
            const sServicePath = bIsNewRule
                ? "/AccountRules"
                : this._getServiceRulePath(oDraftRule.ruleId);
            const fnSuccess = () => {
                MessageToast.show("Regla contable guardada.");
                this._loadRulesFromService({
                    ruleId: oDraftRule.ruleId
                });
            };
            const fnError = (oError) => {
                MessageBox.error(this._extractServiceError(oError, "No se pudo guardar la regla contable."));

                if (sRulePath) {
                    this._selectRuleByPath(sRulePath);
                }
            };

            if (aErrors.length) {
                MessageBox.error(aErrors.join("\n"));
                return;
            }

            this._oViewModel.setProperty("/busy", true);

            if (bIsNewRule) {
                this._oAccountsServiceModel.create(sServicePath, this._mapRuleToService(oDraftRule), {
                    success: fnSuccess,
                    error: fnError
                });
            } else {
                this._oAccountsServiceModel.update(sServicePath, this._mapRuleToService(oDraftRule), {
                    success: fnSuccess,
                    error: fnError
                });
            }
        },

        onCancelRule() {
            const sSelectedRulePath = this._oViewModel.getProperty("/selectedRulePath");
            const sPreviousSelectionPath = this._oViewModel.getProperty("/previousSelectionPath");

            if (this._oViewModel.getProperty("/isNewRule")) {
                if (sPreviousSelectionPath) {
                    this._selectRuleByPath(sPreviousSelectionPath);
                } else {
                    this._clearSelection();
                }

                return;
            }

            if (sSelectedRulePath) {
                this._selectRuleByPath(sSelectedRulePath);
            }
        },

        _loadRulesFromService(oOptions) {
            this._oViewModel.setProperty("/busy", true);

            this._oAccountsServiceModel.read("/AccountRules", {
                success: (oData) => {
                    const aRules = (oData.results || []).map((oRule) => this._mapRuleFromService(oRule));

                    this._oAccountsModel.setProperty("/rules", aRules);
                    this._initializeState(oOptions);
                    this._oViewModel.setProperty("/busy", false);
                },
                error: (oError) => {
                    this._oViewModel.setProperty("/busy", false);
                    MessageBox.error(this._extractServiceError(oError, "No se pudieron leer las reglas contables."));
                }
            });
        },

        _initializeState(oOptions) {
            const aRules = this._oAccountsModel.getProperty("/rules") || [];
            const sRuleIdToSelect = oOptions?.ruleId;

            if (!aRules.length) {
                this._clearSelection();
                return;
            }

            if (sRuleIdToSelect) {
                const iMatchingIndex = aRules.findIndex((oRule) => oRule.ruleId === sRuleIdToSelect);

                if (iMatchingIndex > -1) {
                    this._selectRuleByPath(`/rules/${iMatchingIndex}`);
                    return;
                }
            }

            if (this._oViewModel.getProperty("/selectedRulePath")) {
                this._selectRuleByPath(this._oViewModel.getProperty("/selectedRulePath"));
                return;
            }

            this._selectRuleByPath("/rules/0");
        },

        _selectRuleByPath(sPath) {
            const oRule = sPath ? this._clone(this._oAccountsModel.getProperty(sPath)) : null;

            if (!oRule) {
                this._clearSelection();
                return;
            }

            this._oViewModel.setProperty("/selectedRulePath", sPath);
            this._oViewModel.setProperty("/previousSelectionPath", sPath);
            this._oViewModel.setProperty("/draftRule", oRule);
            this._oViewModel.setProperty("/isEditMode", false);
            this._oViewModel.setProperty("/isNewRule", false);
            this._syncListSelection();
            this._refreshSummary();
        },

        _clearSelection() {
            this._oViewModel.setProperty("/selectedRulePath", "");
            this._oViewModel.setProperty("/previousSelectionPath", "");
            this._oViewModel.setProperty("/draftRule", this._getEmptyRule());
            this._oViewModel.setProperty("/isEditMode", false);
            this._oViewModel.setProperty("/isNewRule", false);
            this._refreshSummary();
            this._syncListSelection();
        },

        _validateRule(oRule) {
            const aRules = this._oAccountsModel.getProperty("/rules") || [];
            const iCurrentIndex = this._oViewModel.getProperty("/isNewRule")
                ? -1
                : this._getIndexFromPath(this._oViewModel.getProperty("/selectedRulePath"));
            const aOverlaps = aRules.filter((oExistingRule, iIndex) => {
                return iIndex !== iCurrentIndex &&
                    oExistingRule.companyCode === oRule.companyCode &&
                    oExistingRule.ledger === oRule.ledger &&
                    oExistingRule.glAccount === oRule.glAccount &&
                    validator.doRangesOverlap(oExistingRule.validFrom, oExistingRule.validTo, oRule.validFrom, oRule.validTo);
            });
            const aErrors = [];

            if (!validator.hasValue(oRule.ruleId)) {
                aErrors.push("ruleId es obligatorio.");
            }

            if (!validator.hasValue(oRule.glAccount)) {
                aErrors.push("glAccount es obligatorio.");
            }

            if (!validator.hasValue(oRule.companyCode)) {
                aErrors.push("companyCode es obligatorio.");
            }

            if (!validator.hasValue(oRule.ledger)) {
                aErrors.push("ledger es obligatorio.");
            }

            if (!validator.hasValue(oRule.classification)) {
                aErrors.push("classification es obligatorio.");
            }

            if (!validator.hasValue(oRule.recpamAccount)) {
                aErrors.push("recpamAccount es obligatorio.");
            }

            if (oRule.classification === "NON_MONETARY" && !validator.hasValue(oRule.adjustmentAccount)) {
                aErrors.push("adjustmentAccount es obligatorio para cuentas no monetarias.");
            }

            if (oRule.classification === "NON_MONETARY" && !validator.hasValue(oRule.offsetAccount)) {
                aErrors.push("offsetAccount es obligatorio para cuentas no monetarias.");
            }

            if (!validator.isDateRangeValid(oRule.validFrom, oRule.validTo)) {
                aErrors.push("validFrom no puede ser mayor que validTo.");
            }

            if (!validator.isPositiveNumber(oRule.simulationFactor)) {
                aErrors.push("simulationFactor debe ser numerico y mayor o igual a 0.");
            }

            if (aRules.some((oExistingRule, iIndex) => iIndex !== iCurrentIndex && oExistingRule.ruleId === oRule.ruleId)) {
                aErrors.push("No se permite ruleId duplicado.");
            }

            if (aOverlaps.length) {
                aErrors.push("No se permiten vigencias solapadas para la misma sociedad, ledger y cuenta contable.");
            }

            return aErrors;
        },

        _normalizeRule(oRule) {
            return {
                ruleId: (oRule.ruleId || "").trim().toUpperCase(),
                glAccount: (oRule.glAccount || "").trim(),
                description: (oRule.description || "").trim(),
                companyCode: (oRule.companyCode || "").trim().toUpperCase(),
                ledger: (oRule.ledger || "").trim().toUpperCase(),
                classification: (oRule.classification || "").trim().toUpperCase(),
                category: (oRule.category || "").trim().toUpperCase(),
                adjustmentAccount: (oRule.adjustmentAccount || "").trim().toUpperCase(),
                offsetAccount: (oRule.offsetAccount || "").trim().toUpperCase(),
                recpamAccount: (oRule.recpamAccount || "").trim().toUpperCase(),
                documentType: (oRule.documentType || "").trim().toUpperCase(),
                simulationFactor: String(Number(oRule.simulationFactor || 0)),
                active: !!oRule.active,
                validFrom: oRule.validFrom || "",
                validTo: oRule.validTo || ""
            };
        },

        _mapRuleFromService(oRule) {
            return {
                ruleId: oRule.RuleId,
                glAccount: oRule.GLAccount,
                description: oRule.Description || "",
                companyCode: oRule.CompanyCode,
                ledger: oRule.Ledger,
                classification: oRule.Classification || "",
                category: oRule.Category || "",
                adjustmentAccount: oRule.AdjustmentAccount || "",
                offsetAccount: oRule.OffsetAccount || "",
                recpamAccount: oRule.RecpamAccount || "",
                documentType: oRule.DocumentType || "",
                simulationFactor: String(Number(oRule.SimulationFactor || 0)),
                active: oRule.Active === "X",
                validFrom: this._formatDateFromService(oRule.ValidFrom),
                validTo: this._formatDateFromService(oRule.ValidTo)
            };
        },

        _mapRuleToService(oRule) {
            return {
                RuleId: oRule.ruleId,
                GLAccount: oRule.glAccount,
                Description: oRule.description,
                CompanyCode: oRule.companyCode,
                Ledger: oRule.ledger,
                Classification: oRule.classification,
                Category: oRule.category,
                AdjustmentAccount: oRule.adjustmentAccount,
                OffsetAccount: oRule.offsetAccount,
                RecpamAccount: oRule.recpamAccount,
                DocumentType: oRule.documentType,
                SimulationFactor: Number(oRule.simulationFactor || 0),
                Active: oRule.active ? "X" : "",
                ValidFrom: this._createDateTime(oRule.validFrom),
                ValidTo: this._createDateTime(oRule.validTo)
            };
        },

        _refreshSummary() {
            const aRules = this._oAccountsModel?.getProperty("/rules") || [];

            this._oViewModel.setProperty("/summary", {
                total: aRules.length,
                active: aRules.filter((oRule) => oRule.active).length,
                nonMonetary: aRules.filter((oRule) => oRule.classification === "NON_MONETARY").length
            });
        },

        _syncListSelection() {
            const oList = this.byId("rulesList");
            const sSelectedRulePath = this._oViewModel.getProperty("/selectedRulePath");
            const aItems = oList ? oList.getItems() : [];

            if (!oList) {
                return;
            }

            if (!sSelectedRulePath) {
                oList.removeSelections(true);
                return;
            }

            aItems.some((oItem) => {
                const bMatch = oItem.getBindingContext("accounts")?.getPath() === sSelectedRulePath;

                if (bMatch) {
                    oList.setSelectedItem(oItem);
                }

                return bMatch;
            });
        },

        _formatDateFromService(vValue) {
            const oDate = vValue instanceof Date ? vValue : (vValue ? new Date(vValue) : null);

            if (!oDate || Number.isNaN(oDate.getTime())) {
                return "";
            }

            return `${oDate.getFullYear()}-${String(oDate.getMonth() + 1).padStart(2, "0")}-${String(oDate.getDate()).padStart(2, "0")}`;
        },

        _createDateTime(sValue) {
            if (!validator.hasValue(sValue)) {
                return null;
            }

            return new Date(`${sValue}T00:00:00`);
        },

        _extractServiceError(oError, sFallbackMessage) {
            let sMessage = sFallbackMessage;

            if (oError?.responseText) {
                try {
                    sMessage = JSON.parse(oError.responseText)?.error?.message?.value || sMessage;
                } catch (oParseError) {
                    sMessage = oError.responseText || sMessage;
                }
            }

            return sMessage;
        },

        _getServiceRulePath(sRuleId) {
            const sKeyPath = this._oAccountsServiceModel.createKey("AccountRules", {
                RuleId: sRuleId
            });

            return sKeyPath.startsWith("/") ? sKeyPath : `/${sKeyPath}`;
        },

        _getDefaultViewState() {
            return {
                selectedRulePath: "",
                previousSelectionPath: "",
                draftRule: this._getEmptyRule(),
                isEditMode: false,
                isNewRule: false,
                busy: false,
                summary: {
                    total: 0,
                    active: 0,
                    nonMonetary: 0
                }
            };
        },

        _getEmptyRule() {
            return {
                ruleId: "",
                glAccount: "",
                description: "",
                companyCode: "",
                ledger: "",
                classification: "NON_MONETARY",
                category: "BS",
                adjustmentAccount: "",
                offsetAccount: "",
                recpamAccount: "",
                documentType: "",
                simulationFactor: "1",
                active: true,
                validFrom: "",
                validTo: ""
            };
        },

        _getIndexFromPath(sPath) {
            const aParts = (sPath || "").split("/");
            return parseInt(aParts[aParts.length - 1], 10);
        },

        _clone(oValue) {
            return JSON.parse(JSON.stringify(oValue));
        }
    });
});
