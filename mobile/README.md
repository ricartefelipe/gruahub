# GruaHub Mobile

## Demo sem Play Store

Instale o APK de demonstração diretamente no Android:

1. Abra http://54.94.163.136/mobile.html no celular.
2. Toque em **Baixar app Android**.
3. Quando o Android solicitar, permita a instalação de apps desta fonte.
4. Abra o arquivo baixado e toque em **Instalar**.

O APK usa a API `http://54.94.163.136:8084` e o Keycloak `http://54.94.163.136:8182`.

Para gerar uma nova versão localmente:

```bash
ANDROID_HOME=/caminho/para/android-sdk ./scripts/build-mobile-apk.sh
```

### Expo Go no Android (alternativa)

1. Instale o **Expo Go** no aparelho.
2. No terminal, configure o ambiente e inicie o Metro:

```bash
cd mobile
cp .env.example .env
npm install
npx expo start
```

3. Deixe computador e telefone na mesma rede quando usar o ambiente local.
4. No Expo Go, escaneie o QR code exibido pelo comando.
5. Faça login com `operador@diversao.demo` e a senha indicada no README raiz.

### Escolher a API e o Keycloak

Edite `mobile/.env` e reinicie o `npx expo start` após alterar as URLs.

**Portfólio público disponível hoje**

```dotenv
EXPO_PUBLIC_API_URL=http://54.94.163.136:8084
EXPO_PUBLIC_KEYCLOAK_URL=http://54.94.163.136:8182
EXPO_PUBLIC_KEYCLOAK_REALM=gruahub
EXPO_PUBLIC_KEYCLOAK_CLIENT_ID=gruahub-mobile
```

Essas URLs são HTTP. Elas servem para a demonstração enquanto estiverem publicamente alcançáveis; para um piloto externo, publique API e Keycloak em HTTPS.

**Stack local em aparelho físico**

Troque `HOST_LAN_IP` pelo IPv4 do computador na mesma rede Wi-Fi:

```dotenv
EXPO_PUBLIC_API_URL=http://HOST_LAN_IP:8080
EXPO_PUBLIC_KEYCLOAK_URL=http://HOST_LAN_IP:8180
EXPO_PUBLIC_KEYCLOAK_REALM=gruahub
EXPO_PUBLIC_KEYCLOAK_CLIENT_ID=gruahub-mobile
```

`localhost` funciona apenas no emulador; no telefone ele aponta para o próprio aparelho.

### APK interno depois

Para instalar o app sem Play Console, gere um APK de distribuição interna:

```bash
npx eas login
npm run build:android-preview
```

O perfil `preview` emite APK. Configure as mesmas variáveis `EXPO_PUBLIC_*` no ambiente do build antes de gerá-lo e compartilhe o link de instalação entregue pelo EAS.
