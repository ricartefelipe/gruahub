package com.gruahub.plays.application;

public final class PlayGrantCalculator {

    public static final String RULE_EXTRA_BONUS = "EXTRA_BONUS";
    public static final String RULE_BUY_N_GET_M = "BUY_N_GET_M";

    private PlayGrantCalculator() {}

    public static int basePlays(long amountCents, long playPriceCents) {
        if (playPriceCents > 0) {
            return (int) (amountCents / playPriceCents);
        }
        return amountCents > 0 ? 1 : 0;
    }

    /**
     * Calcula jogadas a creditar após pagamento confirmado.
     * Bônus de máquina e de campanha só se aplicam quando há jogada paga.
     */
    public static int playsForPayment(long amountCents, long playPriceCents, int machineBonusPlays) {
        return playsForPayment(amountCents, playPriceCents, machineBonusPlays, 0);
    }

    public static int playsForPayment(long amountCents, long playPriceCents,
                                      int machineBonusPlays, int campaignExtraPlays) {
        int base = basePlays(amountCents, playPriceCents);
        if (base <= 0) {
            return 0;
        }
        return base + Math.max(0, machineBonusPlays) + Math.max(0, campaignExtraPlays);
    }

    public static int campaignExtraPlays(int basePlays, String ruleType,
                                         int extraBonusPlays, Integer buyN, Integer getM) {
        if (basePlays <= 0 || ruleType == null) {
            return 0;
        }
        return switch (ruleType) {
            case RULE_EXTRA_BONUS -> Math.max(0, extraBonusPlays);
            case RULE_BUY_N_GET_M -> {
                int n = buyN == null ? 0 : buyN;
                int m = getM == null ? 0 : Math.max(0, getM);
                yield n > 0 ? (basePlays / n) * m : 0;
            }
            default -> 0;
        };
    }
}
