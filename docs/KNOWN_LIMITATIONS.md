# GruaHub MVP — Limitações Conhecidas

## Fora do Escopo do MVP (por design)

- **Hardware real:** Nenhum firmware, ESP32, Raspberry Pi ou controlador físico é suportado. O simulador substitui hardware no MVP.
- **Pagamento real:** Apenas `SandboxPaymentProvider`. Sem integração real com Mercado Pago, PagSeguro, Stone, Pixmaq ou Vendpago. Não há captura de PAN, CVV ou dados brutos de cartão.
- **Emissão fiscal:** Sem NF-e, NFC-e, NFS-e ou obrigações fiscais.
- **Contabilidade completa:** Sem razão contábil, plano de contas ou conciliação bancária.
- **App do jogador:** Nenhuma interface para o jogador final.
- **Carteira digital / fidelidade / publicidade:** Fora do escopo.
- **OTA real:** Sem atualização de firmware remota.
- **IA / ML:** Sem modelos preditivos.
- **Kubernetes / Kafka:** Sem infraestrutura de orquestração complexa.
- **Otimização de rotas:** Priorização por score, não algoritmo de roteirização (TSP, etc.).

## Limitações Técnicas do MVP

- **Outbox via polling:** Latência de até 1s entre evento de domínio e publicação. Suficiente para demonstração; em produção substituir por CDC (Debezium) ou Kafka.
- **Push notifications:** Preparado via FCM mas não configurado no ambiente local. Notificações funcionam apenas dentro do sistema.
- **SMS / e-mail:** Portas preparadas, não implementadas no MVP.
- **Multi-idioma:** Interface em `pt-BR` apenas. Internacionalização não implementada.
- **Algoritmo de roteirização geoespacial:** Integração com mapas (Google Maps, OSRM) é opcional e não configurada localmente.
- **Assinatura digital qualificada:** Confirmação de responsável na visita é simples (checkbox/código), sem certificado digital.
- **Escalabilidade horizontal do backend:** Monólito modular em instância única. Escalonamento horizontal requer adaptação do outbox e locks distribuídos.
- **Suporte a múltiplos controladores:** Contrato MQTT genérico. Controladores específicos (Eletek, Sega, etc.) exigem adaptadores não implementados.
- **Certificados TLS em produção:** Docker Compose usa HTTP simples. HTTPS requer reverse proxy (Traefik, Nginx) configurado externamente.

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
| Seed demonstrativo | ✅ Completo |
| Testes unitários (mobile, 17/17) | ✅ Completo |
| Testes de integração (backend) | ✅ Completo |
| CI GitHub Actions | ✅ Completo |
| Documentação técnica | ✅ Completo |
