package com.gruahub.shared.infra;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Objects;

/**
 * Grava objetos no backend configurado em {@code gruahub.storage.mode}: {@code s3} ou {@code local}.
 *
 * <p>Antes, uma falha do S3 caia silenciosamente em disco e a requisicao terminava como sucesso,
 * com a referencia apontando para um objeto que nao existia no armazenamento de producao. Agora o
 * backend e uma escolha explicita: em modo S3 a indisponibilidade e uma falha
 * ({@link ObjectStorageUnavailableException}) e nada e escrito em outro lugar; o modo local existe
 * para desenvolvimento e testes, e cada gravacao devolve em qual backend ficou, para que a referencia
 * persistida diga onde procurar o objeto.
 */
@ApplicationScoped
public class ObjectStorageService {

    private static final Logger LOG = Logger.getLogger(ObjectStorageService.class);

    /** Referencia de um objeto gravado: a chave e o backend que a guarda. */
    public record StoredObject(String key, StorageBackend backend) {
    }

    private final S3Client s3;
    private final StorageBackend backend;
    private final String bucket;
    private final Path localDir;

    @Inject
    public ObjectStorageService(
        S3Client s3,
        @ConfigProperty(name = "gruahub.storage.mode", defaultValue = "s3") String mode,
        @ConfigProperty(name = "gruahub.s3.bucket", defaultValue = "gruahub") String bucket,
        @ConfigProperty(name = "gruahub.storage.local-dir", defaultValue = "target/object-storage") String localDir
    ) {
        this.s3 = s3;
        this.backend = parse(mode);
        this.bucket = Objects.requireNonNull(bucket, "bucket");
        this.localDir = Path.of(localDir);
    }

    public StorageBackend backend() {
        return backend;
    }

    public StoredObject put(String key, byte[] bytes, String contentType) {
        return switch (backend) {
            case S3 -> putS3(key, bytes, contentType);
            case LOCAL -> putLocal(key, bytes);
        };
    }

    private StoredObject putS3(String key, byte[] bytes, String contentType) {
        try {
            s3.putObject(
                PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType != null ? contentType : "application/octet-stream")
                    .contentLength((long) bytes.length)
                    .build(),
                RequestBody.fromBytes(bytes)
            );
        } catch (RuntimeException e) {
            throw new ObjectStorageUnavailableException(
                "armazenamento de objetos indisponivel para gravar " + key + ": " + e.getMessage(), e);
        }
        LOG.debugf("S3 put ok bucket=%s key=%s bytes=%d", bucket, key, bytes.length);
        return new StoredObject(key, StorageBackend.S3);
    }

    private StoredObject putLocal(String key, byte[] bytes) {
        try {
            Path target = localDir.resolve(key).normalize();
            if (!target.startsWith(localDir.toAbsolutePath().normalize()) && !target.startsWith(localDir.normalize())) {
                throw new IllegalArgumentException("chave fora do diretorio local: " + key);
            }
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
        } catch (IOException io) {
            throw new ObjectStorageUnavailableException("falha ao gravar objeto localmente: " + key, io);
        }
        return new StoredObject(key, StorageBackend.LOCAL);
    }

    private static StorageBackend parse(String mode) {
        String value = mode == null ? "" : mode.trim().toUpperCase(Locale.ROOT);
        try {
            return StorageBackend.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                "gruahub.storage.mode deve ser 's3' ou 'local', recebido: '" + mode + "'", e);
        }
    }
}
