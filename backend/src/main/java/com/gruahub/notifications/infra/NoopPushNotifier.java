package com.gruahub.notifications.infra;

import com.gruahub.notifications.domain.PushNotifier;
import io.quarkus.arc.lookup.LookupIfProperty;
import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

@ApplicationScoped
@LookupIfProperty(name = "gruahub.push.provider", stringValue = "noop", lookupIfMissing = true)
public class NoopPushNotifier implements PushNotifier {

    private static final Logger LOG = Logger.getLogger(NoopPushNotifier.class);

    @Override
    public void notify(PushMessage message) {
        LOG.infof(
                "[PUSH-NOOP] provider=noop tenant=%s machine=%s type=%s severity=%s title=%s",
                message.tenantId(),
                message.machineId(),
                message.alertType(),
                message.severity(),
                message.title());
    }
}
