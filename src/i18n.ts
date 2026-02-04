import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';
import { routing, locales, type Locale } from './i18n/routing';

// Re-export for convenience
export { locales, type Locale, routing };
export const defaultLocale = routing.defaultLocale;

export default getRequestConfig(async ({ requestLocale }) => {
    // 获取请求的 locale
    const locale = await requestLocale;

    // 验证传入的 locale 是否有效
    if (!locale || !locales.includes(locale as Locale)) {
        notFound();
    }

    // 加载所有模块化的翻译文件
    const [
        common,
        stages,
        assetLibrary,
        smartImport,
        nav,
        apiConfig,
        modelSection,
        providerSection,
        landing,
        auth,
        workspace,
        workspaceDetail,
        profile,
        billing,
        apiTypes,
        actions,
        video,
        storyboard,
        assets,
        voice,
        errors,
        novelPromotion,
        configModal,
        worldContextModal,
        progress,
        scriptView,
        assetHub,
        assetModal,
        assetPicker
    ] = await Promise.all([
        import(`../messages/${locale}/common.json`),
        import(`../messages/${locale}/stages.json`),
        import(`../messages/${locale}/assetLibrary.json`),
        import(`../messages/${locale}/smartImport.json`),
        import(`../messages/${locale}/nav.json`),
        import(`../messages/${locale}/apiConfig.json`),
        import(`../messages/${locale}/modelSection.json`),
        import(`../messages/${locale}/providerSection.json`),
        import(`../messages/${locale}/landing.json`),
        import(`../messages/${locale}/auth.json`),
        import(`../messages/${locale}/workspace.json`),
        import(`../messages/${locale}/workspaceDetail.json`),
        import(`../messages/${locale}/profile.json`),
        import(`../messages/${locale}/billing.json`),
        import(`../messages/${locale}/apiTypes.json`),
        import(`../messages/${locale}/actions.json`),
        import(`../messages/${locale}/video.json`),
        import(`../messages/${locale}/storyboard.json`),
        import(`../messages/${locale}/assets.json`),
        import(`../messages/${locale}/voice.json`),
        import(`../messages/${locale}/errors.json`),
        import(`../messages/${locale}/novel-promotion.json`),
        import(`../messages/${locale}/configModal.json`),
        import(`../messages/${locale}/worldContextModal.json`),
        import(`../messages/${locale}/progress.json`),
        import(`../messages/${locale}/scriptView.json`),
        import(`../messages/${locale}/assetHub.json`),
        import(`../messages/${locale}/assetModal.json`),
        import(`../messages/${locale}/assetPicker.json`)
    ]);

    return {
        locale,
        messages: {
            common: common.default,
            stages: stages.default,
            assetLibrary: assetLibrary.default,
            smartImport: smartImport.default,
            nav: nav.default,
            apiConfig: apiConfig.default,
            modelSection: modelSection.default,
            providerSection: providerSection.default,
            landing: landing.default,
            auth: auth.default,
            workspace: workspace.default,
            workspaceDetail: workspaceDetail.default,
            profile: profile.default,
            billing: billing.default,
            apiTypes: apiTypes.default,
            actions: actions.default,
            video: video.default,
            storyboard: storyboard.default,
            assets: assets.default,
            voice: voice.default,
            errors: errors.default,
            novelPromotion: novelPromotion.default,
            configModal: configModal.default,
            worldContextModal: worldContextModal.default,
            progress: progress.default,
            scriptView: scriptView.default,
            assetHub: assetHub.default,
            assetModal: assetModal.default,
            assetPicker: assetPicker.default
        }
    };
});
