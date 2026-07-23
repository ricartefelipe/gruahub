/**
 * Config dinâmica do Expo — projectId EAS vem do ambiente.
 * Rode `npx eas init` (ou `eas init`) na pasta mobile e exporte EXPO_PUBLIC_EAS_PROJECT_ID.
 */
module.exports = ({ config }) => {
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    process.env.EAS_PROJECT_ID ||
    config.extra?.eas?.projectId ||
    'gruahub-local-dev';

  return {
    ...config,
    extra: {
      ...config.extra,
      eas: {
        ...(config.extra?.eas || {}),
        projectId,
      },
    },
  };
};
