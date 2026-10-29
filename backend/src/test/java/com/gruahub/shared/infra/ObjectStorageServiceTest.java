package com.gruahub.shared.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;

class ObjectStorageServiceTest {

    @TempDir
    Path dir;

    @Test
    void s3ModeFailureIsAnErrorAndWritesNothingLocally() {
        S3Client s3 = mock(S3Client.class);
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
            .thenThrow(SdkClientException.create("connection refused"));
        ObjectStorageService storage = new ObjectStorageService(s3, "s3", "gruahub", dir.toString());

        assertThrows(ObjectStorageUnavailableException.class, () -> storage.put("t/visits/v/a.jpg", new byte[] {1}, "image/jpeg"));

        assertFalse(Files.exists(dir.resolve("t/visits/v/a.jpg")), "falha do S3 nao pode cair em disco");
    }

    @Test
    void s3ModeSuccessReportsTheS3Backend() {
        S3Client s3 = mock(S3Client.class);
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class))).thenReturn(PutObjectResponse.builder().build());
        ObjectStorageService storage = new ObjectStorageService(s3, "s3", "gruahub", dir.toString());

        ObjectStorageService.StoredObject stored = storage.put("k", new byte[] {1}, null);

        assertEquals(StorageBackend.S3, stored.backend());
        assertEquals("k", stored.key());
        assertFalse(Files.exists(dir.resolve("k")));
    }

    @Test
    void localModeWritesToDiskAndReportsTheLocalBackend() throws Exception {
        S3Client s3 = mock(S3Client.class);
        ObjectStorageService storage = new ObjectStorageService(s3, "local", "gruahub", dir.toString());

        ObjectStorageService.StoredObject stored = storage.put("t/visits/v/a.jpg", new byte[] {7, 8}, "image/jpeg");

        assertEquals(StorageBackend.LOCAL, stored.backend());
        assertTrue(Files.exists(dir.resolve("t/visits/v/a.jpg")));
        assertEquals(2, Files.size(dir.resolve("t/visits/v/a.jpg")));
        verifyNoInteractions(s3);
    }

    @Test
    void localModeRefusesAKeyThatLeavesTheDirectory() {
        ObjectStorageService storage = new ObjectStorageService(mock(S3Client.class), "local", "gruahub", dir.toString());

        assertThrows(IllegalArgumentException.class, () -> storage.put("../fora.txt", new byte[] {1}, null));
    }

    @Test
    void anUnknownModeIsRefusedAtConstruction() {
        assertThrows(IllegalArgumentException.class,
            () -> new ObjectStorageService(mock(S3Client.class), "disk", "gruahub", dir.toString()));
    }
}
