package com.gruahub.shared.infra;

/** Onde um objeto foi gravado. Fica registrado junto da referencia, para que a leitura saiba onde procurar. */
public enum StorageBackend {
    S3,
    LOCAL
}
