package com.gruahub.plays.application;

public final class PlayGrantCalculator {

    private PlayGrantCalculator() {}

    /**
     * Calcula jogadas a creditar após pagamento confirmado.
     * Bônus da máquina só se aplica quando há ao menos uma jogada paga.
     */
    public static int playsForPayment(long amountCents, long playPriceCents, int bonusPlays) {
        int basePlays = playPriceCents > 0
                ? (int) (amountCents / playPriceCents)
                : (amountCents > 0 ? 1 : 0);
        if (basePlays <= 0) {
            return 0;
        }
        int safeBonus = Math.max(0, bonusPlays);
        return basePlays + safeBonus;
    }
}
