package com.gruahub;

import io.quarkus.arc.DefaultBean;
import io.quarkus.arc.profile.IfBuildProfile;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.Collections;
import java.util.Set;

@IfBuildProfile("test")
public class TestJsonWebTokenProducer {

    @Inject
    SecurityIdentity identity;

    @Produces
    @RequestScoped
    @DefaultBean
    JsonWebToken jsonWebToken() {
        if (identity != null && identity.getPrincipal() instanceof JsonWebToken jwt) {
            return jwt;
        }
        String name = identity != null && identity.getPrincipal() != null
            ? identity.getPrincipal().getName()
            : "";
        return new EmptyJsonWebToken(name);
    }

    private static final class EmptyJsonWebToken implements JsonWebToken {
        private final String name;

        EmptyJsonWebToken(String name) {
            this.name = name == null ? "" : name;
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public Set<String> getClaimNames() {
            return Collections.emptySet();
        }

        @Override
        public <T> T getClaim(String claimName) {
            return null;
        }
    }
}
