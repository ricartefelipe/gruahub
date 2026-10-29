package com.gruahub.shared.infra;

/** O armazenamento configurado nao aceitou a gravacao. Nada foi escrito em outro lugar. */
public class ObjectStorageUnavailableException extends RuntimeException {

    public ObjectStorageUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
