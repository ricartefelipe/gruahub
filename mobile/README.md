# GruaHub Mobile

## Testar no celular agora (sem Play Store)

Canal recomendado do piloto: **web HTTPS no Chrome do Android**.

1. No celular, abra  
   [https://gruahub.54.94.163.136.sslip.io/mobile.html](https://gruahub.54.94.163.136.sslip.io/mobile.html)
2. Toque em **Abrir login HTTPS**.
3. Toque em **Entrar com SSO** e use:
   - e-mail: `operador@diversao.demo`
   - senha: `gruahub@2025`
4. No menu, abra **Rotas** e **Visitas**.

URL direta do login:  
[https://gruahub.54.94.163.136.sslip.io/login](https://gruahub.54.94.163.136.sslip.io/login)

Não use o APK experimental hospedado em HTTP: o Android bloqueia tráfego cleartext e builds debug.

## Expo Go (recursos nativos: GPS, câmera, offline)

Use quando precisar validar check-in, QR ou fila offline — não é obrigatório para demo de operação.

1. Instale o **Expo Go** no aparelho.
2. No PC:

```bash
cd mobile
cp .env.example .env
npm install
npx expo start --tunnel
```

`--tunnel` evita depender da mesma Wi-Fi. Na mesma LAN, `npx expo start` basta.

3. Escaneie o QR no Expo Go.
4. Login: `operador@diversao.demo` / `gruahub@2025`.

### URLs no `.env`

Reinicie o Metro após alterar:

**Portfólio público (HTTP — só desenvolvimento / Expo Go)**

```dotenv
EXPO_PUBLIC_API_URL=http://54.94.163.136:8084
EXPO_PUBLIC_KEYCLOAK_URL=http://54.94.163.136:8182
EXPO_PUBLIC_KEYCLOAK_REALM=gruahub
EXPO_PUBLIC_KEYCLOAK_CLIENT_ID=gruahub-mobile
```

API e Keycloak do portfólio ainda são HTTP. O caminho estável para operadores no celular é o **web HTTPS** acima. Build de APK só faz sentido depois que API/Keycloak estiverem em HTTPS.

**Stack local em aparelho físico**

```dotenv
EXPO_PUBLIC_API_URL=http://HOST_LAN_IP:8080
EXPO_PUBLIC_KEYCLOAK_URL=http://HOST_LAN_IP:8180
EXPO_PUBLIC_KEYCLOAK_REALM=gruahub
EXPO_PUBLIC_KEYCLOAK_CLIENT_ID=gruahub-mobile
```

`localhost` só funciona no emulador.

## APK interno (adiado)

Play Store está fora do orçamento. APK interno só após:

1. API e Keycloak em HTTPS
2. Build **release** (não debug) sem cleartext
3. Hospedagem do APK em HTTPS, ou instalação via EAS

```bash
# Local (requer Android SDK) — gera debug; não use para piloto externo
ANDROID_HOME=/caminho/para/android-sdk ./scripts/build-mobile-apk.sh

# EAS preview (APK interno)
npx eas login
npm run build:android-preview
```

Configure `EXPO_PUBLIC_*` com URLs **HTTPS** antes do build EAS.
