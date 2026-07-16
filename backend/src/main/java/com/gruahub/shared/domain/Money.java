package com.gruahub.shared.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * Value object imutável para valores monetários.
 * Internamente armazenado em centavos (long) para evitar problemas de ponto flutuante.
 */
public final class Money {

    private final long amountCents;
    private final String currency;

    private Money(long amountCents, String currency) {
        if (currency == null || currency.isBlank()) {
            throw new IllegalArgumentException("Currency must not be blank");
        }
        this.amountCents = amountCents;
        this.currency = currency.toUpperCase();
    }

    public static Money of(long amountCents, String currency) {
        return new Money(amountCents, currency);
    }

    public static Money ofBrl(long amountCents) {
        return new Money(amountCents, "BRL");
    }

    public static Money zero(String currency) {
        return new Money(0L, currency);
    }

    public long getAmountCents() {
        return amountCents;
    }

    public String getCurrency() {
        return currency;
    }

    public BigDecimal toBigDecimal() {
        return BigDecimal.valueOf(amountCents).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    public Money add(Money other) {
        assertSameCurrency(other);
        return new Money(this.amountCents + other.amountCents, this.currency);
    }

    public Money subtract(Money other) {
        assertSameCurrency(other);
        return new Money(this.amountCents - other.amountCents, this.currency);
    }

    public Money multiply(int factor) {
        return new Money(this.amountCents * factor, this.currency);
    }

    public Money percentage(BigDecimal pct) {
        long result = BigDecimal.valueOf(amountCents)
                .multiply(pct)
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP)
                .longValue();
        return new Money(result, this.currency);
    }

    public boolean isPositive() {
        return amountCents > 0;
    }

    public boolean isZero() {
        return amountCents == 0;
    }

    private void assertSameCurrency(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new IllegalArgumentException(
                    "Cannot operate on different currencies: " + this.currency + " vs " + other.currency);
        }
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Money)) return false;
        Money money = (Money) o;
        return amountCents == money.amountCents && currency.equals(money.currency);
    }

    @Override
    public int hashCode() {
        return Objects.hash(amountCents, currency);
    }

    @Override
    public String toString() {
        return currency + " " + toBigDecimal().toPlainString();
    }
}
