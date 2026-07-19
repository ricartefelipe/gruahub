export const THEME_STORAGE_KEY = 'gruahub-theme';

export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;
