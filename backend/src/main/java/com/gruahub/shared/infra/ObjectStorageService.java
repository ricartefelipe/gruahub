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

/**
 * Upload de objetos para MinIO/S3 com fallback local (testes / MinIO indisponível).
 */
@ApplicationScoped
public class ObjectStorageService {

    private static final Logger LOG = Logger.getLogger(ObjectStorageService.class);

    @Inject
    S3Client s3;

    @ConfigProperty(name = "gruahub.s3.bucket", defaultValue = "gruahub")
    String bucket;

    @ConfigProperty(name = "gruahub.s3.local-fallback-dir", defaultValue = "target/object-storage")
    String localFallbackDir;

    public void put(String key, byte[] bytes, String contentType) {
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
            LOG.debugf("S3 put ok bucket=%s key=%s bytes=%d", bucket, key, bytes.length);
        } catch (Exception e) {
            LOG.warnf(e, "S3 put falhou — usando fallback local key=%s: %s", key, e.getMessage());
            writeLocal(key, bytes);
        }
    }

    private void writeLocal(String key, byte[] bytes) {
        try {
            Path target = Path.of(localFallbackDir, key);
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
        } catch (IOException io) {
            throw new IllegalStateException("Falha ao gravar objeto localmente: " + key, io);
        }
    }
}
