package com.gruahub.plays;

import com.gruahub.plays.application.PlayGrantCalculator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PlayGrantCalculatorTest {

    @Test
    void addsMachineBonusWhenThereIsAtLeastOnePaidPlay() {
        assertEquals(3, PlayGrantCalculator.playsForPayment(400, 200, 1));
        assertEquals(2, PlayGrantCalculator.playsForPayment(200, 200, 1));
        assertEquals(1, PlayGrantCalculator.playsForPayment(200, 200, 0));
    }

    @Test
    void doesNotGrantBonusWithoutPaidPlays() {
        assertEquals(0, PlayGrantCalculator.playsForPayment(100, 200, 5));
        assertEquals(0, PlayGrantCalculator.playsForPayment(0, 200, 2));
    }

    @Test
    void ignoresNegativeBonus() {
        assertEquals(1, PlayGrantCalculator.playsForPayment(200, 200, -3));
    }

    @Test
    void fallsBackToOnePlayWhenPriceIsZeroButAmountPositive() {
        assertEquals(4, PlayGrantCalculator.playsForPayment(500, 0, 3));
    }
}
