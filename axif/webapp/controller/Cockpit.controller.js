sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "axi/axif/utils/formatter"
], (Controller, JSONModel, MessageBox, MessageToast, formatter) => {
    "use strict";

    return Controller.extend("axi.axif.controller.Cockpit", {
        formatter,

        onInit() {
            this._oRunsModel = this.getOwnerComponent().getModel("runs");
            this._oMethodsModel = this.getOwnerComponent().getModel("methods");
            this._oCompanyCodesModel = this.getOwnerComponent().getModel("companyCodes");
            this._oCockpitServiceModel = this.getOwnerComponent().getModel("cockpitService");
            this._oMethodsServiceModel = this.getOwnerComponent().getModel("methodsService");

            this._oViewModel = new JSONModel(this._getDefaultViewState());
            this.getView().setModel(this._oViewModel, "cockpitView");

            if (!this._oCockpitServiceModel) {
                return;
            }

            this._loadMethodsReferenceData();
            this._loadRunsFromService();
        },

        onSelectionChange() {
            this._deriveMethod();
        },

        onSimulateRun() {
            const oFilters = this._clone(this._oViewModel.getProperty("/filters"));
            const aErrors = this._validateFilters(oFilters);

            if (aErrors.length) {
                MessageBox.error(aErrors.join("\n"));
                return;
            }

            this._oViewModel.setProperty("/busy", true);

            this._createRun(oFilters, (sRunId) => {
                this._invokeRunAction("DeriveMethod", sRunId, () => {
                    this._invokeRunAction("SimulateRun", sRunId, () => {
                        this._loadRunsFromService({
                            runId: sRunId,
                            selectAsDraft: true,
                            successMessage: "Corrida simulada."
                        });
                    }, "No se pudo simular la corrida.");
                }, "No se pudo derivar el metodo para la corrida.");
            });
        },

        onPostRun() {
            const oDraftRun = this._clone(this._oViewModel.getProperty("/draftRun"));

            if (!oDraftRun.id || oDraftRun.status !== "SIMULATED") {
                MessageBox.warning("Primero debe existir una corrida simulada para contabilizar.");
                return;
            }

            this._oViewModel.setProperty("/busy", true);
            this._invokeRunAction("PostRun", oDraftRun.id, () => {
                this._loadRunsFromService({
                    runId: oDraftRun.id,
                    selectAsDraft: true,
                    successMessage: "Corrida contabilizada."
                });
            }, "No se pudo contabilizar la corrida.");
        },

        onReverseRun() {
            const oSelectedRun = this._clone(this._oViewModel.getProperty("/selectedRun"));

            if (!oSelectedRun.id || oSelectedRun.status !== "POSTED") {
                MessageBox.warning("Seleccione una corrida contabilizada para revertir.");
                return;
            }

            this._oViewModel.setProperty("/busy", true);
            this._invokeRunAction("ReverseRun", oSelectedRun.id, () => {
                this._loadRunsFromService({
                    runId: oSelectedRun.id,
                    selectAsDraft: false,
                    successMessage: "Corrida revertida."
                });
            }, "No se pudo revertir la corrida.");
        },

        onRunSelectionChange(oEvent) {
            const sPath = oEvent.getParameter("listItem")?.getBindingContext("runs")?.getPath();
            const iSelectedRunIndex = this._getIndexFromPath(sPath);
            const oSelectedRun = this._clone((this._oRunsModel.getProperty("/runs") || [])[iSelectedRunIndex] || this._getEmptyRun());

            this._oViewModel.setProperty("/selectedRun", oSelectedRun);
            this._syncRunSelection();
        },

        _loadMethodsReferenceData() {
            if (!this._oMethodsServiceModel) {
                return;
            }

            this._oMethodsServiceModel.read("/Methods", {
                urlParameters: {
                    "$expand": "to_Assignments"
                },
                success: (oData) => {
                    const aMethods = (oData.results || []).map((oMethod) => this._mapMethodFromService(oMethod));

                    this._oMethodsModel.setProperty("/methods", aMethods);
                    this._deriveMethod();
                }
            });
        },

        _loadRunsFromService(oOptions) {
            this._oViewModel.setProperty("/busy", true);

            this._oCockpitServiceModel.read("/Runs", {
                urlParameters: {
                    "$expand": "to_Items"
                },
                success: (oData) => {
                    const aRuns = (oData.results || [])
                        .map((oRun) => this._mapRunFromService(oRun))
                        .sort((oLeft, oRight) => (oRight.executedAt || "").localeCompare(oLeft.executedAt || ""));

                    this._oRunsModel.setProperty("/runs", aRuns);
                    this._initializeState(oOptions);
                    this._oViewModel.setProperty("/busy", false);

                    if (oOptions?.successMessage) {
                        MessageToast.show(oOptions.successMessage);
                    }
                },
                error: (oError) => {
                    this._oViewModel.setProperty("/busy", false);
                    MessageBox.error(this._extractServiceError(oError, "No se pudieron leer las corridas."));
                }
            });
        },

        _initializeState(oOptions) {
            const aRuns = this._oRunsModel.getProperty("/runs") || [];
            const sRunIdToSelect = oOptions?.runId;
            let oSelectedRun = null;

            this._ensureValidInitialSelection();
            this._deriveMethod();

            if (sRunIdToSelect) {
                oSelectedRun = aRuns.find((oRun) => oRun.id === sRunIdToSelect) || null;
            }

            if (!oSelectedRun && aRuns.length) {
                oSelectedRun = aRuns[0];
            }

            this._oViewModel.setProperty("/selectedRun", this._clone(oSelectedRun || this._getEmptyRun()));

            if (oOptions?.selectAsDraft && oSelectedRun) {
                this._oViewModel.setProperty("/draftRun", this._clone(oSelectedRun));
                this._oViewModel.setProperty("/simulationEntries", this._clone(oSelectedRun.items || []));
                this._oViewModel.setProperty("/simulationTotals", this._calculateSimulationTotals(oSelectedRun.items || []));
            } else if (!oOptions?.keepDraft) {
                this._oViewModel.setProperty("/draftRun", this._getEmptyRun());
                this._oViewModel.setProperty("/simulationEntries", []);
                this._oViewModel.setProperty("/simulationTotals", {
                    totalAdjustment: "0.00",
                    recpam: "0.00"
                });
            }

            this._refreshSummary();
            this._syncRunSelection();
        },

        _createRun(oFilters, fnSuccess) {
            const oDerivedMethod = this._deriveMethod() || {};
            const oCompanyCode = (this._oCompanyCodesModel?.getProperty("/companyCodes") || []).find((oItem) => oItem.companyCode === oFilters.companyCode) || {};
            const sRunId = `RUN-${oFilters.companyCode}-${oFilters.fiscalYear}${String(parseInt(oFilters.fiscalPeriod, 10)).padStart(2, "0")}-${Date.now()}`;
            const oPayload = {
                RunId: sRunId,
                CompanyCode: oFilters.companyCode,
                CompanyName: oCompanyCode.name || "",
                Ledger: oDerivedMethod.ledger || "",
                FiscalYear: oFilters.fiscalYear,
                FiscalPeriod: String(parseInt(oFilters.fiscalPeriod, 10)).padStart(2, "0"),
                RunType: this._oViewModel.getProperty("/runType"),
                ExecutionMode: this._oViewModel.getProperty("/executionMode"),
                MethodId: oDerivedMethod.methodId || "",
                IndexSeries: oDerivedMethod.indexSeries || "",
                DocumentType: oDerivedMethod.documentType || "",
                PostingDate: this._createDateTime(oFilters.postingDate),
                Status: "DRAFT",
                TriggeredBy: this._oViewModel.getProperty("/triggeredBy"),
                RequestPayload: JSON.stringify({
                    companyCode: oFilters.companyCode,
                    runDate: oFilters.runDate,
                    postingDate: oFilters.postingDate,
                    fiscalYear: oFilters.fiscalYear,
                    fiscalPeriod: String(parseInt(oFilters.fiscalPeriod, 10)).padStart(2, "0"),
                    runType: this._oViewModel.getProperty("/runType"),
                    executionMode: this._oViewModel.getProperty("/executionMode")
                }),
                ResponsePayload: ""
            };

            this._oCockpitServiceModel.create("/Runs", oPayload, {
                success: () => fnSuccess(sRunId),
                error: (oError) => {
                    this._oViewModel.setProperty("/busy", false);
                    MessageBox.error(this._extractServiceError(oError, "No se pudo crear la corrida."));
                }
            });
        },

        _invokeRunAction(sActionName, sRunId, fnSuccess, sFallbackMessage) {
            this._oCockpitServiceModel.callFunction(`/${sActionName}`, {
                method: "POST",
                urlParameters: {
                    RunId: sRunId
                },
                success: fnSuccess,
                error: (oError) => {
                    this._oViewModel.setProperty("/busy", false);
                    MessageBox.error(this._extractServiceError(oError, sFallbackMessage));
                }
            });
        },

        _deriveMethod() {
            const sCompanyCode = this._oViewModel.getProperty("/filters/companyCode");
            const sRunDate = this._oViewModel.getProperty("/filters/runDate");
            const oDerivableContext = this._findDerivableContext(sCompanyCode, sRunDate);
            const oDerivedMethod = oDerivableContext ? oDerivableContext.method : null;

            if (!sCompanyCode || !sRunDate) {
                this._oViewModel.setProperty("/derivedMethod", {});
                this._oViewModel.setProperty("/derivationMessage", "Seleccione sociedad y fecha para derivar el metodo.");
                return null;
            }

            this._oViewModel.setProperty("/derivedMethod", oDerivedMethod || {});
            this._oViewModel.setProperty(
                "/derivationMessage",
                oDerivedMethod
                    ? `Metodo ${oDerivedMethod.methodId} derivado para ${sCompanyCode} en fecha ${sRunDate}.`
                    : `No hay un metodo activo/asignado para ${sCompanyCode} en fecha ${sRunDate}.`
            );

            return oDerivedMethod;
        },

        _validateFilters(oFilters) {
            const aErrors = [];

            if (!oFilters.companyCode) {
                aErrors.push("La sociedad es obligatoria.");
            }

            if (!oFilters.runDate) {
                aErrors.push("La fecha de corrida es obligatoria.");
            }

            if (!oFilters.postingDate) {
                aErrors.push("La fecha de contabilizacion es obligatoria.");
            }

            if (!oFilters.fiscalYear || !/^\d{4}$/.test(oFilters.fiscalYear)) {
                aErrors.push("El ejercicio debe tener 4 digitos.");
            }

            if (!oFilters.fiscalPeriod || !/^(0?[1-9]|1[0-2])$/.test(oFilters.fiscalPeriod)) {
                aErrors.push("El periodo debe estar entre 1 y 12.");
            }

            return aErrors;
        },

        _mapRunFromService(oRun) {
            const aItems = oRun.to_Items?.results || oRun.to_Items || [];

            return {
                id: oRun.RunId,
                companyCode: oRun.CompanyCode,
                companyName: oRun.CompanyName || "",
                ledger: oRun.Ledger || "",
                fiscalYear: oRun.FiscalYear,
                fiscalPeriod: oRun.FiscalPeriod,
                runType: oRun.RunType,
                executionMode: oRun.ExecutionMode,
                methodId: oRun.MethodId || "",
                indexSeries: oRun.IndexSeries || "",
                documentType: oRun.DocumentType || "",
                postingDate: this._formatDateFromService(oRun.PostingDate),
                executedAt: this._formatTimestampFromService(oRun.ExecutedAt),
                status: oRun.Status || "DRAFT",
                triggeredBy: oRun.TriggeredBy || "",
                requestPayload: oRun.RequestPayload || "",
                responsePayload: oRun.ResponsePayload || "",
                items: aItems.map((oItem) => this._mapRunItemFromService(oItem))
            };
        },

        _mapRunItemFromService(oItem) {
            return {
                itemNo: oItem.ItemNo,
                glAccount: oItem.GLAccount || "",
                description: oItem.Description || "",
                baseBalance: Number(oItem.BaseBalance || 0).toFixed(2),
                adjustmentPercent: Number(oItem.AdjustmentPercent || 0).toFixed(2),
                adjustmentAmount: Number(oItem.AdjustmentAmount || 0).toFixed(2),
                adjustmentAccount: oItem.AdjustmentAccount || "",
                offsetAccount: oItem.OffsetAccount || "",
                recpamAccount: oItem.RecpamAccount || ""
            };
        },

        _mapMethodFromService(oMethod) {
            const aAssignments = oMethod.to_Assignments?.results || oMethod.to_Assignments || [];

            return {
                methodId: oMethod.MethodId,
                description: oMethod.Description || "",
                country: oMethod.Country,
                ledger: oMethod.Ledger,
                indexSeries: oMethod.IndexSeries,
                documentType: oMethod.DocumentType || "",
                active: oMethod.Active === "X",
                validFrom: this._formatDateFromService(oMethod.ValidFrom),
                validTo: this._formatDateFromService(oMethod.ValidTo),
                assignments: aAssignments.map((oAssignment) => ({
                    companyCode: oAssignment.CompanyCode,
                    methodId: oAssignment.MethodId,
                    active: oAssignment.Active === "X",
                    validFrom: this._formatDateFromService(oAssignment.ValidFrom),
                    validTo: this._formatDateFromService(oAssignment.ValidTo)
                }))
            };
        },

        _refreshSummary() {
            const aRuns = this._oRunsModel?.getProperty("/runs") || [];

            this._oViewModel.setProperty("/summary", {
                total: aRuns.length,
                simulated: aRuns.filter((oRun) => oRun.status === "SIMULATED").length,
                posted: aRuns.filter((oRun) => oRun.status === "POSTED").length,
                failed: aRuns.filter((oRun) => oRun.status === "FAILED").length
            });
        },

        _calculateSimulationTotals(aSimulationEntries) {
            const fTotalAdjustment = aSimulationEntries.reduce((fAcc, oEntry) => {
                return fAcc + Number(oEntry.adjustmentAmount || 0);
            }, 0);

            return {
                totalAdjustment: fTotalAdjustment.toFixed(2),
                recpam: (fTotalAdjustment * -0.18).toFixed(2)
            };
        },

        _ensureValidInitialSelection() {
            const oFilters = this._clone(this._oViewModel.getProperty("/filters"));
            const oCurrentMatch = this._findDerivableContext(oFilters.companyCode, oFilters.runDate);
            let oFallbackContext;

            if (oCurrentMatch) {
                return;
            }

            oFallbackContext = this._findInitialDerivableContext();

            if (!oFallbackContext) {
                return;
            }

            this._oViewModel.setProperty("/filters/companyCode", oFallbackContext.companyCode);
            this._oViewModel.setProperty("/filters/runDate", oFallbackContext.runDate);
            this._oViewModel.setProperty("/filters/postingDate", oFallbackContext.runDate);
            this._oViewModel.setProperty("/filters/fiscalYear", oFallbackContext.runDate.slice(0, 4));
            this._oViewModel.setProperty("/filters/fiscalPeriod", oFallbackContext.runDate.slice(5, 7));
        },

        _findInitialDerivableContext() {
            const sToday = new Date().toISOString().slice(0, 10);
            const aMethods = this._oMethodsModel?.getProperty("/methods") || [];
            let oFallbackContext = null;

            aMethods.some((oMethod) => {
                if (!oMethod.active) {
                    return false;
                }

                return (oMethod.assignments || []).some((oAssignment) => {
                    const sCandidateDate = this._getBestCandidateDate(sToday, oMethod, oAssignment);

                    if (!sCandidateDate) {
                        return false;
                    }

                    oFallbackContext = {
                        companyCode: oAssignment.companyCode,
                        runDate: sCandidateDate
                    };

                    return true;
                });
            });

            return oFallbackContext;
        },

        _findDerivableContext(sCompanyCode, sRunDate) {
            const aMethods = this._oMethodsModel?.getProperty("/methods") || [];
            let oDerivedContext = null;

            aMethods.some((oMethod) => {
                if (!oMethod.active || !this._isDateInRange(sRunDate, oMethod.validFrom, oMethod.validTo)) {
                    return false;
                }

                return (oMethod.assignments || []).some((oAssignment) => {
                    const bAssignmentValid = oAssignment.companyCode === sCompanyCode &&
                        oAssignment.active &&
                        this._isDateInRange(sRunDate, oAssignment.validFrom, oAssignment.validTo);

                    if (bAssignmentValid) {
                        oDerivedContext = {
                            method: oMethod,
                            assignment: oAssignment
                        };
                    }

                    return bAssignmentValid;
                });
            });

            return oDerivedContext;
        },

        _getBestCandidateDate(sPreferredDate, oMethod, oAssignment) {
            const aCandidates = [
                sPreferredDate,
                this._getLatestDate(oMethod.validFrom, oAssignment.validFrom)
            ].filter(Boolean);

            return aCandidates.find((sCandidateDate) => {
                return oAssignment.active &&
                    this._isDateInRange(sCandidateDate, oMethod.validFrom, oMethod.validTo) &&
                    this._isDateInRange(sCandidateDate, oAssignment.validFrom, oAssignment.validTo);
            }) || null;
        },

        _syncRunSelection() {
            const oTable = this.byId("runsTable");
            const oSelectedRun = this._oViewModel.getProperty("/selectedRun");
            const aItems = oTable ? oTable.getItems() : [];
            const aRuns = this._oRunsModel?.getProperty("/runs") || [];
            const iRunIndex = aRuns.findIndex((oRun) => oRun.id === oSelectedRun.id);

            if (!oTable) {
                return;
            }

            if (iRunIndex > -1 && aItems[iRunIndex]) {
                oTable.setSelectedItem(aItems[iRunIndex]);
            } else {
                oTable.removeSelections(true);
            }
        },

        _formatDateFromService(vValue) {
            const oDate = vValue instanceof Date ? vValue : (vValue ? new Date(vValue) : null);

            if (!oDate || Number.isNaN(oDate.getTime())) {
                return "";
            }

            return `${oDate.getFullYear()}-${String(oDate.getMonth() + 1).padStart(2, "0")}-${String(oDate.getDate()).padStart(2, "0")}`;
        },

        _formatTimestampFromService(vValue) {
            const oDate = vValue instanceof Date ? vValue : (vValue ? new Date(vValue) : null);

            if (!oDate || Number.isNaN(oDate.getTime())) {
                return "";
            }

            return `${oDate.getFullYear()}-${String(oDate.getMonth() + 1).padStart(2, "0")}-${String(oDate.getDate()).padStart(2, "0")} ${String(oDate.getHours()).padStart(2, "0")}:${String(oDate.getMinutes()).padStart(2, "0")}:${String(oDate.getSeconds()).padStart(2, "0")}`;
        },

        _createDateTime(sValue) {
            if (!sValue) {
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

        _getDefaultViewState() {
            const sToday = new Date().toISOString().slice(0, 10);

            return {
                filters: {
                    companyCode: "AR10",
                    runDate: sToday,
                    postingDate: sToday,
                    fiscalYear: sToday.slice(0, 4),
                    fiscalPeriod: sToday.slice(5, 7)
                },
                executionMode: "TEST",
                runType: "MONTHLY",
                triggeredBy: "AXI_IDX_COM_USER",
                derivedMethod: {},
                derivationMessage: "Seleccione sociedad y fecha para derivar el metodo.",
                simulationEntries: [],
                simulationTotals: {
                    totalAdjustment: "0.00",
                    recpam: "0.00"
                },
                draftRun: this._getEmptyRun(),
                selectedRun: this._getEmptyRun(),
                summary: {
                    total: 0,
                    simulated: 0,
                    posted: 0,
                    failed: 0
                },
                busy: false
            };
        },

        _getEmptyRun() {
            return {
                id: "",
                status: "",
                requestPayload: "",
                responsePayload: "",
                items: []
            };
        },

        _isDateInRange(sDate, sValidFrom, sValidTo) {
            const iDate = Date.parse(`${sDate}T00:00:00`);
            const iFrom = sValidFrom ? Date.parse(`${sValidFrom}T00:00:00`) : Number.MIN_SAFE_INTEGER;
            const iTo = sValidTo ? Date.parse(`${sValidTo}T00:00:00`) : Number.MAX_SAFE_INTEGER;

            return iDate >= iFrom && iDate <= iTo;
        },

        _getLatestDate(sFirstDate, sSecondDate) {
            if (!sFirstDate) {
                return sSecondDate || null;
            }

            if (!sSecondDate) {
                return sFirstDate;
            }

            return sFirstDate >= sSecondDate ? sFirstDate : sSecondDate;
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
