module.exports = ({ config }) => {
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    process.env.EAS_PROJECT_ID ||
    config.extra?.eas?.projectId;

  return {
    ...config,
    extra: {
      ...config.extra,
      ...(projectId
        ? {
            eas: {
              ...(config.extra?.eas || {}),
              projectId,
            },
          }
        : {}),
    },
    ...(projectId
      ? {
          updates: {
            ...config.updates,
            url: `https://u.expo.dev/${projectId}`,
          },
        }
      : {}),
  };
};
