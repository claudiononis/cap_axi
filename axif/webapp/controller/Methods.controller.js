sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "axi/axif/utils/validator"
], (Controller, JSONModel, MessageBox, MessageToast, validator) => {
    "use strict";

    return Controller.extend("axi.axif.controller.Methods", {
        onInit() {
            this._oMethodsModel = this.getOwnerComponent().getModel("methods");
            this._oMethodsServiceModel = this.getOwnerComponent().getModel("methodsService");
            this._oIndexesModel = this.getOwnerComponent().getModel("indexes");
            this._oCompanyCodesModel = this.getOwnerComponent().getModel("companyCodes");
            this._oViewModel = new JSONModel(this._getDefaultViewState());
            this.getView().setModel(this._oViewModel, "methodsView");

            if (!this._oMethodsServiceModel) {
                return;
            }

            this._loadMethodsFromService();
        },

        onMethodSelectionChange(oEvent) {
            if (this._oViewModel.getProperty("/editMode")) {
                MessageBox.warning("Guarde o cancele la edicion actual antes de cambiar de metodo.");
                this._syncMethodSelection();
                return;
            }

            const sPath = oEvent.getParameter("listItem")?.getBindingContext("methods")?.getPath();
            const iIndex = this._getIndexFromPath(sPath);

            this._loadMethodByIndex(iIndex);
        },

        onCreateMethod() {
            this._setViewState({
                currentMethod: this._createEmptyMethod(),
                currentAssignment: this._createEmptyAssignment(),
                selectedMethodIndex: -1,
                selectedAssignmentIndex: -1,
                editMode: true,
                assignmentEditMode: false,
                isNewMethod: true,
                isNewAssignment: false,
                sourceMethodIndex: this._oViewModel.getProperty("/selectedMethodIndex")
            });
            this._syncMethodSelection();
            this._syncAssignmentSelection();
        },

        onEditMethod() {
            const iSelectedMethodIndex = this._oViewModel.getProperty("/selectedMethodIndex");
            const oMethod = this._getMethodByIndex(iSelectedMethodIndex);

            if (!oMethod) {
                MessageBox.warning("Seleccione un metodo para editar.");
                return;
            }

            this._setViewState({
                currentMethod: this._clone(oMethod),
                currentAssignment: this._createEmptyAssignment(),
                selectedAssignmentIndex: -1,
                editMode: true,
                assignmentEditMode: false,
                isNewMethod: false,
                isNewAssignment: false,
                sourceMethodIndex: iSelectedMethodIndex
            });
            this._syncAssignmentSelection();
        },

        onSaveMethod() {
            const oCurrentMethod = this._normalizeMethod(this._clone(this._oViewModel.getProperty("/currentMethod")));
            const iSelectedMethodIndex = this._oViewModel.getProperty("/selectedMethodIndex");
            const bIsNewMethod = this._oViewModel.getProperty("/isNewMethod");
            const bAssignmentsChanged = this._haveAssignmentsChanged(oCurrentMethod, iSelectedMethodIndex);
            const aErrors = [];

            this._oViewModel.setProperty("/currentMethod", this._clone(oCurrentMethod));

            if (this._oViewModel.getProperty("/assignmentEditMode")) {
                const oAssignmentBufferSave = this._saveCurrentAssignmentToBuffer();

                if (!oAssignmentBufferSave.valid) {
                    MessageBox.error(oAssignmentBufferSave.message);
                    return;
                }
            }

            oCurrentMethod.assignments = (this._oViewModel.getProperty("/currentMethod/assignments") || [])
                .map((oAssignment) => this._normalizeAssignment(oAssignment, oCurrentMethod.methodId));

            aErrors.push(...this._validateMethod(oCurrentMethod, iSelectedMethodIndex));

            if (!bIsNewMethod && bAssignmentsChanged) {
                aErrors.push("El backend actual no expone persistencia directa para asignaciones de metodos existentes. Solo se puede guardar la cabecera sin cambios en asignaciones.");
            }

            if (aErrors.length) {
                MessageBox.error(Array.from(new Set(aErrors)).join("\n"));
                return;
            }

            this._oViewModel.setProperty("/busy", true);

            if (bIsNewMethod) {
                this._oMethodsServiceModel.create("/Methods", this._mapMethodToService(oCurrentMethod, true), {
                    success: () => {
                        MessageToast.show("Metodo guardado.");
                        this._loadMethodsFromService({
                            methodId: oCurrentMethod.methodId
                        });
                    },
                    error: (oError) => {
                        this._oViewModel.setProperty("/busy", false);
                        MessageBox.error(this._extractServiceError(oError, "No se pudo guardar el metodo."));
                    }
                });

                return;
            }

            this._oMethodsServiceModel.update(this._getServiceMethodPath(oCurrentMethod.methodId), this._mapMethodToService(oCurrentMethod, false), {
                success: () => {
                    MessageToast.show("Metodo guardado.");
                    this._loadMethodsFromService({
                        methodId: oCurrentMethod.methodId
                    });
                },
                error: (oError) => {
                    this._oViewModel.setProperty("/busy", false);
                    MessageBox.error(this._extractServiceError(oError, "No se pudo guardar el metodo."));
                }
            });
        },

        onCancelEdit() {
            const iSelectedMethodIndex = this._oViewModel.getProperty("/selectedMethodIndex");
            const iSourceMethodIndex = this._oViewModel.getProperty("/sourceMethodIndex");

            if (this._oViewModel.getProperty("/isNewMethod")) {
                if (iSourceMethodIndex > -1) {
                    this._loadMethodByIndex(iSourceMethodIndex);
                } else {
                    this._clearSelection();
                }
            } else {
                this._loadMethodByIndex(iSelectedMethodIndex);
            }
        },

        onAssignmentSelectionChange(oEvent) {
            if (this._oViewModel.getProperty("/assignmentEditMode")) {
                MessageBox.warning("Guarde o descarte la edicion actual de la asignacion.");
                this._syncAssignmentSelection();
                return;
            }

            const sPath = oEvent.getParameter("listItem")?.getBindingContext("methodsView")?.getPath();
            const iIndex = this._getIndexFromPath(sPath);
            const aAssignments = this._oViewModel.getProperty("/currentMethod/assignments") || [];
            const oAssignment = aAssignments[iIndex];

            this._oViewModel.setProperty("/selectedAssignmentIndex", iIndex);
            this._oViewModel.setProperty("/currentAssignment", this._clone(oAssignment || this._createEmptyAssignment()));
        },

        onCreateAssignment() {
            if (!this._oViewModel.getProperty("/editMode")) {
                MessageBox.warning("Active la edicion del metodo para agregar asignaciones.");
                return;
            }

            this._oViewModel.setProperty("/currentAssignment", this._createEmptyAssignment(this._oViewModel.getProperty("/currentMethod/methodId")));
            this._oViewModel.setProperty("/selectedAssignmentIndex", -1);
            this._oViewModel.setProperty("/assignmentEditMode", true);
            this._oViewModel.setProperty("/isNewAssignment", true);
            this._syncAssignmentSelection();
        },

        onEditAssignment() {
            const iSelectedAssignmentIndex = this._oViewModel.getProperty("/selectedAssignmentIndex");
            const aAssignments = this._oViewModel.getProperty("/currentMethod/assignments") || [];

            if (iSelectedAssignmentIndex < 0 || !aAssignments[iSelectedAssignmentIndex]) {
                MessageBox.warning("Seleccione una asignacion para editar.");
                return;
            }

            this._oViewModel.setProperty("/currentAssignment", this._clone(aAssignments[iSelectedAssignmentIndex]));
            this._oViewModel.setProperty("/assignmentEditMode", true);
            this._oViewModel.setProperty("/isNewAssignment", false);
        },

        onDeleteAssignment() {
            const iSelectedAssignmentIndex = this._oViewModel.getProperty("/selectedAssignmentIndex");
            const aAssignments = this._clone(this._oViewModel.getProperty("/currentMethod/assignments") || []);

            if (iSelectedAssignmentIndex < 0 || !aAssignments[iSelectedAssignmentIndex]) {
                MessageBox.warning("Seleccione una asignacion para eliminar.");
                return;
            }

            aAssignments.splice(iSelectedAssignmentIndex, 1);
            this._oViewModel.setProperty("/currentMethod/assignments", aAssignments);
            this._oViewModel.setProperty("/currentAssignment", this._createEmptyAssignment(this._oViewModel.getProperty("/currentMethod/methodId")));
            this._oViewModel.setProperty("/selectedAssignmentIndex", -1);
            this._oViewModel.setProperty("/assignmentEditMode", false);
            this._oViewModel.setProperty("/isNewAssignment", false);
            this._syncAssignmentSelection();
            MessageToast.show("Asignacion eliminada del buffer del metodo.");
        },

        _loadMethodsFromService(oOptions) {
            this._oViewModel.setProperty("/busy", true);

            this._oMethodsServiceModel.read("/Methods", {
                urlParameters: {
                    "$expand": "to_Assignments"
                },
                success: (oData) => {
                    const aMethods = (oData.results || []).map((oMethod) => this._mapMethodFromService(oMethod));

                    this._oMethodsModel.setProperty("/methods", aMethods);
                    this._initializeState(oOptions);
                    this._oViewModel.setProperty("/busy", false);
                },
                error: (oError) => {
                    this._oViewModel.setProperty("/busy", false);
                    MessageBox.error(this._extractServiceError(oError, "No se pudieron leer los metodos."));
                }
            });
        },

        _initializeState(oOptions) {
            const aMethods = this._oMethodsModel.getProperty("/methods") || [];
            const sMethodIdToSelect = oOptions?.methodId;

            if (!aMethods.length) {
                this._clearSelection();
                return;
            }

            if (sMethodIdToSelect) {
                const iMatch = aMethods.findIndex((oMethod) => oMethod.methodId === sMethodIdToSelect);

                if (iMatch > -1) {
                    this._loadMethodByIndex(iMatch);
                    return;
                }
            }

            if (this._oViewModel.getProperty("/selectedMethodIndex") > -1) {
                this._loadMethodByIndex(this._oViewModel.getProperty("/selectedMethodIndex"));
                return;
            }

            this._loadMethodByIndex(0);
        },

        _loadMethodByIndex(iSelectedMethodIndex) {
            const oMethod = this._getMethodByIndex(iSelectedMethodIndex);

            if (!oMethod) {
                this._clearSelection();
                return;
            }

            this._setViewState({
                currentMethod: this._clone(oMethod),
                currentAssignment: this._createEmptyAssignment(oMethod.methodId),
                selectedMethodIndex: iSelectedMethodIndex,
                selectedAssignmentIndex: -1,
                editMode: false,
                assignmentEditMode: false,
                isNewMethod: false,
                isNewAssignment: false,
                sourceMethodIndex: iSelectedMethodIndex
            });
            this._syncMethodSelection();
            this._syncAssignmentSelection();
        },

        _clearSelection() {
            this._setViewState(this._getDefaultViewState());
            this._syncMethodSelection();
            this._syncAssignmentSelection();
        },

        _saveCurrentAssignmentToBuffer() {
            const oCurrentMethod = this._oViewModel.getProperty("/currentMethod");
            const oCurrentAssignment = this._normalizeAssignment(
                this._clone(this._oViewModel.getProperty("/currentAssignment")),
                oCurrentMethod.methodId
            );
            const aAssignments = this._clone(oCurrentMethod.assignments || []);
            const iSelectedAssignmentIndex = this._oViewModel.getProperty("/selectedAssignmentIndex");
            const aErrors = [];

            if (!validator.hasValue(oCurrentAssignment.companyCode)) {
                aErrors.push("companyCode es obligatorio.");
            }

            if (!validator.isDateRangeValid(oCurrentAssignment.validFrom, oCurrentAssignment.validTo)) {
                aErrors.push("validFrom no puede ser mayor que validTo.");
            }

            if (aErrors.length) {
                return {
                    valid: false,
                    message: aErrors.join("\n")
                };
            }

            if (this._oViewModel.getProperty("/isNewAssignment")) {
                aAssignments.push(oCurrentAssignment);
                this._oViewModel.setProperty("/selectedAssignmentIndex", aAssignments.length - 1);
            } else if (iSelectedAssignmentIndex > -1) {
                aAssignments[iSelectedAssignmentIndex] = oCurrentAssignment;
            }

            this._oViewModel.setProperty("/currentMethod/assignments", aAssignments);
            this._oViewModel.setProperty("/currentAssignment", this._clone(oCurrentAssignment));
            this._oViewModel.setProperty("/assignmentEditMode", false);
            this._oViewModel.setProperty("/isNewAssignment", false);
            this._oViewModel.setProperty("/selectedAssignmentIndex", aAssignments.findIndex((oAssignment) => {
                return oAssignment.companyCode === oCurrentAssignment.companyCode &&
                    oAssignment.validFrom === oCurrentAssignment.validFrom;
            }));
            this._syncAssignmentSelection();

            return {
                valid: true
            };
        },

        _validateMethod(oMethod, iSelectedMethodIndex) {
            const aErrors = [];
            const aMethods = this._oMethodsModel.getProperty("/methods") || [];
            const aAssignments = oMethod.assignments || [];
            const oIndexSeries = (this._oIndexesModel.getProperty("/series") || []).find((oSeries) => oSeries.code === oMethod.indexSeries);

            if (!validator.hasValue(oMethod.methodId)) {
                aErrors.push("methodId es obligatorio.");
            }

            if (!validator.hasValue(oMethod.country)) {
                aErrors.push("country es obligatorio.");
            }

            if (!validator.hasValue(oMethod.ledger)) {
                aErrors.push("ledger es obligatorio.");
            }

            if (!validator.hasValue(oMethod.indexSeries)) {
                aErrors.push("indexSeries es obligatorio.");
            }

            if (!validator.isDateRangeValid(oMethod.validFrom, oMethod.validTo)) {
                aErrors.push("validFrom no puede ser mayor que validTo.");
            }

            if (aMethods.some((oExistingMethod, iIndex) => iIndex !== iSelectedMethodIndex && oExistingMethod.methodId === oMethod.methodId)) {
                aErrors.push("No se permite methodId duplicado.");
            }

            if (!oIndexSeries) {
                aErrors.push("La serie de indice seleccionada no existe.");
            } else {
                if (!oIndexSeries.active) {
                    aErrors.push("La serie de indice seleccionada no esta activa.");
                }

                if (validator.hasValue(oMethod.country) && oIndexSeries.country !== oMethod.country) {
                    aErrors.push("La serie de indice no corresponde al pais del metodo.");
                }

                if (validator.hasValue(oMethod.validFrom) && validator.hasValue(oMethod.validTo) && !this._hasCompleteMonthlyCoverage(oIndexSeries.values || [], oMethod.validFrom, oMethod.validTo)) {
                    aErrors.push("La serie de indice no cubre todos los meses de la vigencia del metodo.");
                }
            }

            aAssignments.forEach((oAssignment, iAssignmentIndex) => {
                const oCompany = (this._oCompanyCodesModel.getProperty("/companyCodes") || []).find((oItem) => oItem.companyCode === oAssignment.companyCode);

                if (!validator.hasValue(oAssignment.companyCode)) {
                    aErrors.push(`La asignacion ${iAssignmentIndex + 1} debe informar companyCode.`);
                }

                if (!validator.isDateRangeValid(oAssignment.validFrom, oAssignment.validTo)) {
                    aErrors.push(`La asignacion ${oAssignment.companyCode || iAssignmentIndex + 1} tiene fechas invalidas.`);
                }

                if (!oCompany) {
                    aErrors.push(`La sociedad ${oAssignment.companyCode || "(vacia)"} no existe.`);
                    return;
                }

                if (oCompany.country !== oMethod.country) {
                    aErrors.push(`La sociedad ${oAssignment.companyCode} no corresponde al pais del metodo.`);
                }

                if (!(oCompany.ledgers || []).includes(oMethod.ledger)) {
                    aErrors.push(`El ledger ${oMethod.ledger} no esta habilitado para la sociedad ${oAssignment.companyCode}.`);
                }
            });

            aAssignments.forEach((oAssignment, iAssignmentIndex) => {
                aAssignments.forEach((oOtherAssignment, iOtherIndex) => {
                    if (iAssignmentIndex >= iOtherIndex) {
                        return;
                    }

                    if (oAssignment.companyCode === oOtherAssignment.companyCode &&
                        validator.doRangesOverlap(oAssignment.validFrom, oAssignment.validTo, oOtherAssignment.validFrom, oOtherAssignment.validTo)) {
                        aErrors.push(`No se permiten vigencias solapadas para la sociedad ${oAssignment.companyCode}.`);
                    }
                });
            });

            return Array.from(new Set(aErrors));
        },

        _haveAssignmentsChanged(oCurrentMethod, iSelectedMethodIndex) {
            const oOriginalMethod = this._getMethodByIndex(iSelectedMethodIndex);

            if (!oOriginalMethod) {
                return false;
            }

            return JSON.stringify(this._normalizeAssignmentsForCompare(oOriginalMethod.assignments || [])) !==
                JSON.stringify(this._normalizeAssignmentsForCompare(oCurrentMethod.assignments || []));
        },

        _normalizeAssignmentsForCompare(aAssignments) {
            return aAssignments
                .map((oAssignment) => this._normalizeAssignment(oAssignment, oAssignment.methodId))
                .sort((oLeft, oRight) => {
                    return `${oLeft.companyCode}|${oLeft.validFrom}`.localeCompare(`${oRight.companyCode}|${oRight.validFrom}`);
                });
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
                monthlyReversal: oMethod.MonthlyReversal === "X",
                yearEndNoReversal: oMethod.YearEndNoReversal === "X",
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

        _mapMethodToService(oMethod, bIncludeAssignments) {
            const oPayload = {
                MethodId: oMethod.methodId,
                Description: oMethod.description,
                Country: oMethod.country,
                Ledger: oMethod.ledger,
                IndexSeries: oMethod.indexSeries,
                DocumentType: oMethod.documentType,
                MonthlyReversal: oMethod.monthlyReversal ? "X" : "",
                YearEndNoReversal: oMethod.yearEndNoReversal ? "X" : "",
                Active: oMethod.active ? "X" : "",
                ValidFrom: this._createDateTime(oMethod.validFrom),
                ValidTo: this._createDateTime(oMethod.validTo)
            };

            if (bIncludeAssignments) {
                oPayload.to_Assignments = oMethod.assignments.map((oAssignment) => ({
                    CompanyCode: oAssignment.companyCode,
                    MethodId: oMethod.methodId,
                    Active: oAssignment.active ? "X" : "",
                    ValidFrom: this._createDateTime(oAssignment.validFrom),
                    ValidTo: this._createDateTime(oAssignment.validTo)
                }));
            }

            return oPayload;
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

        _syncMethodSelection() {
            const oList = this.byId("methodsList");
            const iSelectedMethodIndex = this._oViewModel.getProperty("/selectedMethodIndex");
            const aItems = oList ? oList.getItems() : [];

            if (!oList) {
                return;
            }

            if (iSelectedMethodIndex > -1 && aItems[iSelectedMethodIndex]) {
                oList.setSelectedItem(aItems[iSelectedMethodIndex]);
            } else {
                oList.removeSelections(true);
            }
        },

        _syncAssignmentSelection() {
            const oTable = this.byId("assignmentTable");
            const iSelectedAssignmentIndex = this._oViewModel.getProperty("/selectedAssignmentIndex");
            const aItems = oTable ? oTable.getItems() : [];

            if (!oTable) {
                return;
            }

            if (iSelectedAssignmentIndex > -1 && aItems[iSelectedAssignmentIndex]) {
                oTable.setSelectedItem(aItems[iSelectedAssignmentIndex]);
            } else {
                oTable.removeSelections(true);
            }
        },

        _getMethodByIndex(iIndex) {
            return (this._oMethodsModel.getProperty("/methods") || [])[iIndex];
        },

        _getServiceMethodPath(sMethodId) {
            const sKeyPath = this._oMethodsServiceModel.createKey("Methods", {
                MethodId: sMethodId
            });

            return sKeyPath.startsWith("/") ? sKeyPath : `/${sKeyPath}`;
        },

        _getIndexFromPath(sPath) {
            const aParts = (sPath || "").split("/");
            return parseInt(aParts[aParts.length - 1], 10);
        },

        _createEmptyMethod() {
            return {
                methodId: "",
                description: "",
                country: "",
                ledger: "",
                indexSeries: "",
                documentType: "",
                monthlyReversal: false,
                yearEndNoReversal: false,
                active: true,
                validFrom: "",
                validTo: "",
                assignments: []
            };
        },

        _createEmptyAssignment(sMethodId) {
            return {
                companyCode: "",
                methodId: sMethodId || "",
                active: true,
                validFrom: "",
                validTo: ""
            };
        },

        _normalizeMethod(oMethod) {
            return {
                methodId: (oMethod.methodId || "").trim().toUpperCase(),
                description: (oMethod.description || "").trim(),
                country: (oMethod.country || "").trim().toUpperCase(),
                ledger: (oMethod.ledger || "").trim().toUpperCase(),
                indexSeries: (oMethod.indexSeries || "").trim().toUpperCase(),
                documentType: (oMethod.documentType || "").trim().toUpperCase(),
                monthlyReversal: !!oMethod.monthlyReversal,
                yearEndNoReversal: !!oMethod.yearEndNoReversal,
                active: !!oMethod.active,
                validFrom: oMethod.validFrom || "",
                validTo: oMethod.validTo || "",
                assignments: (oMethod.assignments || []).map((oAssignment) => this._normalizeAssignment(oAssignment, oMethod.methodId))
            };
        },

        _normalizeAssignment(oAssignment, sMethodId) {
            return {
                companyCode: (oAssignment.companyCode || "").trim().toUpperCase(),
                methodId: (sMethodId || oAssignment.methodId || "").trim().toUpperCase(),
                active: !!oAssignment.active,
                validFrom: oAssignment.validFrom || "",
                validTo: oAssignment.validTo || ""
            };
        },

        _hasCompleteMonthlyCoverage(aPeriods, sValidFrom, sValidTo) {
            const aPeriodIds = aPeriods.map((oPeriod) => oPeriod.period || oPeriod.PeriodId);
            let sCurrentPeriod = `${sValidFrom.slice(0, 4)}-${sValidFrom.slice(5, 7)}`;
            const sLastPeriod = `${sValidTo.slice(0, 4)}-${sValidTo.slice(5, 7)}`;

            while (sCurrentPeriod <= sLastPeriod) {
                if (!aPeriodIds.includes(sCurrentPeriod)) {
                    return false;
                }

                sCurrentPeriod = this._getNextPeriod(sCurrentPeriod);
            }

            return true;
        },

        _getNextPeriod(sPeriod) {
            let iYear = parseInt(sPeriod.slice(0, 4), 10);
            let iMonth = parseInt(sPeriod.slice(5, 7), 10);

            iMonth += 1;

            if (iMonth === 13) {
                iMonth = 1;
                iYear += 1;
            }

            return `${iYear}-${String(iMonth).padStart(2, "0")}`;
        },

        _getDefaultViewState() {
            return {
                currentMethod: this._createEmptyMethod(),
                currentAssignment: this._createEmptyAssignment(),
                selectedMethodIndex: -1,
                selectedAssignmentIndex: -1,
                editMode: false,
                assignmentEditMode: false,
                isNewMethod: false,
                isNewAssignment: false,
                sourceMethodIndex: -1,
                busy: false
            };
        },

        _setViewState(oState) {
            Object.keys(oState).forEach((sKey) => {
                this._oViewModel.setProperty(`/${sKey}`, oState[sKey]);
            });
        },

        _clone(oValue) {
            return JSON.parse(JSON.stringify(oValue));
        }
    });
});
