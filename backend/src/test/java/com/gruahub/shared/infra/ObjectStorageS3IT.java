package com.gruahub.shared.infra;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.time.Duration;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.HostConfig;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

/**
 * O servico contra o armazenamento S3 real da pilha (SeaweedFS), nas situacoes que o produto enfrenta:
 * indisponibilidade, credencial invalida, recuperacao, reinicio e autorizacao.
 */
class ObjectStorageS3IT {

    private static final String IMAGE = "chrislusf/seaweedfs:4.51";
    private static final int S3_PORT = 9000;
    // Porta do host fixada por teste: um `docker start` apos a queda simulada trocaria uma porta
    // aleatoria, e o cliente deixaria de encontrar o servico que voltou.
    private static final int HOST_PORT = freePort();

    @SuppressWarnings("resource")
    static final GenericContainer<?> SEAWEED = new GenericContainer<>(IMAGE)
        .withExposedPorts(S3_PORT)
        .withCreateContainerCmdModifier(cmd -> cmd
            .withHostConfig(HostConfig.newHostConfig().withPortBindings(
                new PortBinding(Ports.Binding.bindPort(HOST_PORT), ExposedPort.tcp(S3_PORT))))
            .withEntrypoint("/bin/sh", "-c",
            "mkdir -p /etc/seaweedfs && printf '%s' '{\"identities\":[{\"name\":\"t\",\"credentials\":[{\"accessKey\":\"it-access\",\"secretKey\":\"it-secret\"}],\"actions\":[\"Admin\",\"Read\",\"Write\",\"List\",\"Tagging\"]}]}' > /etc/seaweedfs/s3.json && exec weed server -dir=/data -ip.bind=0.0.0.0 -s3 -s3.config=/etc/seaweedfs/s3.json -s3.port=9000"))
        .waitingFor(Wait.forHttp("/").forPort(S3_PORT).forStatusCode(403).withStartupTimeout(Duration.ofMinutes(3)));

    @BeforeAll
    static void start() {
        SEAWEED.start();
        client("it-access", "it-secret").createBucket(CreateBucketRequest.builder().bucket("gruahub").build());
    }

    @AfterAll
    static void stop() {
        SEAWEED.stop();
    }

    private static S3Client client(String access, String secret) {
        return S3Client.builder()
            .endpointOverride(URI.create("http://" + SEAWEED.getHost() + ":" + HOST_PORT))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(access, secret)))
            .region(Region.US_EAST_1)
            .forcePathStyle(true)
            .httpClientBuilder(UrlConnectionHttpClient.builder())
            .build();
    }

    private static ObjectStorageService storage(String access, String secret) {
        return new ObjectStorageService(client(access, secret), "s3", "gruahub", "target/object-storage-it");
    }

    @Test
    void writesAndReadsBackWithValidCredentials() {
        ObjectStorageService.StoredObject stored = storage("it-access", "it-secret").put("t/visits/v/ok.jpg", new byte[] {1, 2, 3}, "image/jpeg");

        assertEquals(StorageBackend.S3, stored.backend());
        byte[] back = client("it-access", "it-secret").getObjectAsBytes(GetObjectRequest.builder().bucket("gruahub").key("t/visits/v/ok.jpg").build()).asByteArray();
        assertArrayEquals(new byte[] {1, 2, 3}, back);
    }

    @Test
    void invalidCredentialsAreRefusedAndNothingIsStored() {
        assertThrows(ObjectStorageUnavailableException.class,
            () -> storage("it-access", "wrong").put("t/visits/v/invasor.jpg", new byte[] {1}, "image/jpeg"));
        assertThrows(Exception.class, () -> client("it-access", "it-secret")
            .getObjectAsBytes(GetObjectRequest.builder().bucket("gruahub").key("t/visits/v/invasor.jpg").build()));
    }

    @Test
    void outageIsAnErrorAndTheServiceRecoversAfterRestartKeepingObjects() {
        ObjectStorageService storage = storage("it-access", "it-secret");
        storage.put("t/visits/v/antes.jpg", new byte[] {9}, "image/jpeg");

        SEAWEED.getDockerClient().stopContainerCmd(SEAWEED.getContainerId()).exec();
        assertThrows(ObjectStorageUnavailableException.class,
            () -> storage.put("t/visits/v/durante.jpg", new byte[] {1}, "image/jpeg"));

        SEAWEED.getDockerClient().startContainerCmd(SEAWEED.getContainerId()).exec();
        awaitUp();
        ObjectStorageService.StoredObject after = storage.put("t/visits/v/depois.jpg", new byte[] {2}, "image/jpeg");
        assertEquals(StorageBackend.S3, after.backend());
        byte[] kept = client("it-access", "it-secret").getObjectAsBytes(GetObjectRequest.builder().bucket("gruahub").key("t/visits/v/antes.jpg").build()).asByteArray();
        assertArrayEquals(new byte[] {9}, kept, "objeto gravado antes do reinicio continua la");
        assertThrows(Exception.class, () -> client("it-access", "it-secret")
            .getObjectAsBytes(GetObjectRequest.builder().bucket("gruahub").key("t/visits/v/durante.jpg").build()),
            "a gravacao recusada durante a queda nao existe em lugar nenhum");
    }

    private static int freePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException e) {
            throw new IllegalStateException("sem porta livre para o teste", e);
        }
    }

    private static void awaitUp() {
        long deadline = System.currentTimeMillis() + Duration.ofMinutes(2).toMillis();
        while (System.currentTimeMillis() < deadline) {
            try {
                client("it-access", "it-secret").listBuckets();
                return;
            } catch (RuntimeException e) {
                try { Thread.sleep(2000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); return; }
            }
        }
        throw new IllegalStateException("S3 nao voltou apos o reinicio");
    }
}
