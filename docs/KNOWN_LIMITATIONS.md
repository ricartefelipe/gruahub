# GruaHub MVP — Limitações Conhecidas

## Fora do Escopo do MVP (por design)

- **Hardware real:** Firmware Pulse Adapter em `firmware/adaptador-fino/` (PlatformIO). Sem PCB própria; DevKit + harness. Validação E2E em máquina física ainda aberta — ver `docs/HARDWARE_ADAPTER.md`.
- **Pagamento real:** Apenas `SandboxPaymentProvider`. Sem integração real com Mercado Pago, PagSeguro, Stone, Pixmaq ou Vendpago. Não há captura de PAN, CVV ou dados brutos de cartão.
- **Emissão fiscal SEFAZ:** Sem NF-e/NFC-e/NFS-e reais. Há apenas registry stub (`fiscal_document`) + PDF com aviso “não fiscal”.
- **Contabilidade completa:** Sem razão contábil, plano de contas ou conciliação bancária.
- **App do jogador:** Nenhuma interface para o jogador final.
- **Carteira digital / fidelidade / publicidade:** Fora do escopo.
- **OTA real:** Sem atualização de firmware remota.
- **IA / ML:** Sem modelos preditivos.
- **Kubernetes / Kafka:** Sem infraestrutura de orquestração complexa.
- **Otimização de rotas:** Priorização por score, não algoritmo de roteirização (TSP, etc.).

## Limitações Técnicas do MVP

- **CI remoto (GitHub Actions):** Jobs do PR podem falhar sem executar se billing/spending limit da conta bloquear Actions. Enquanto isso, use `./scripts/ci-local.sh` (contracts + simulators + firmware por padrão).
- **Outbox via polling:** Latência de até 1s entre evento de domínio e publicação. Suficiente para demonstração; em produção substituir por CDC (Debezium) ou Kafka.
- **Push nativo FCM direto:** Entrega via Expo Push Service (`GRUAHUB_PUSH_PROVIDER=expo` + registry `device_token`). Sem Firebase service account próprio no backend (caminho Expo).
- **SMS / e-mail:** Não implementados no MVP.
- **Multi-idioma:** Interface em `pt-BR` apenas. Internacionalização não implementada.
- **Algoritmo de roteirização geoespacial:** Integração com mapas (Google Maps, OSRM) é opcional e não configurada localmente.
- **Assinatura digital qualificada:** Confirmação de responsável na visita é simples (checkbox/código), sem certificado digital.
- **Escalabilidade horizontal do backend:** Monólito modular em instância única. Escalonamento horizontal requer adaptação do outbox e locks distribuídos.
- **Suporte a múltiplos controladores:** Contrato MQTT genérico. Pulse Adapter (HMV) e vendor (Eletek/Sega) seguem o plano do Adaptador Fino; stubs Java existem, protocolo físico ainda aberto.
- **TLS em produção pública:** HTTPS local via Caddy (`tls internal`) + template `Caddyfile.public.example` para Let's Encrypt. DNS real / cert ACME não são exercitados no CI.
- **Edge / WAF:** rate-limit leve e bloqueio de paths no Caddy; não substitui WAF comercial nem store distribuído multi-instância.
- **Backup / DR:** `pg_dump` local + upload S3-compatible opcional + restore drill + runbook em `DEPLOYMENT.md`. Sem PITR; retenção offsite depende de lifecycle do bucket; restore destrutivo é manual.

## Status de Implementação

Consulte `docs/TASKS.md` (estado real) e `docs/MVP_READINESS.md`.

| Componente | Status |
|-----------|--------|
| Estrutura do monorepo | ✅ Completo |
| Backend Quarkus 3.8.6 / Java 21 | ✅ Completo |
| Docker Compose (8 serviços) | ✅ Completo |
| Frontend Web Next.js 14 | ✅ Completo |
| App Mobile Expo 51 | ✅ Completo |
| Simuladores (máquina + pagamento) | ✅ Completo |
| Firmware Adaptador Fino (Pulse) | ✅ Build esp32dev; E2E físico aberto |
| Seed demonstrativo | ✅ Completo |
| Testes unitários (mobile, 17/17) | ✅ Completo |
| Testes de integração (backend) | ✅ Completo |
| CI GitHub Actions | ✅ Completo |
| Documentação técnica | ✅ Completo |
