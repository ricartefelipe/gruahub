package com.gruahub.fiscal;

import com.gruahub.fiscal.domain.FiscalDocumentStatus;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FiscalDocumentStatusTest {

    @Test
    void draftCanIssueOrCancel() {
        assertTrue(FiscalDocumentStatus.DRAFT.canTransitionTo(FiscalDocumentStatus.ISSUED_STUB));
        assertTrue(FiscalDocumentStatus.DRAFT.canTransitionTo(FiscalDocumentStatus.CANCELLED));
        assertFalse(FiscalDocumentStatus.DRAFT.canTransitionTo(FiscalDocumentStatus.DRAFT));
    }

    @Test
    void issuedStubCanOnlyCancel() {
        assertTrue(FiscalDocumentStatus.ISSUED_STUB.canTransitionTo(FiscalDocumentStatus.CANCELLED));
        assertFalse(FiscalDocumentStatus.ISSUED_STUB.canTransitionTo(FiscalDocumentStatus.DRAFT));
        assertFalse(FiscalDocumentStatus.CANCELLED.canTransitionTo(FiscalDocumentStatus.ISSUED_STUB));
    }
}
