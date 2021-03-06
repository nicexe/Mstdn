import * as path from 'path';
import {Config, Account} from '../main/config';
import r from './require';
import log from './log';

type Plugin = (c: Config, a: Account) => void;
interface Plugins {
    [module_path: string]: Plugin;
}

export default class PluginsLoader {
    preloads: Plugins;
    loaded: boolean;

    constructor(private config: Config, private account: Account) {
        this.loaded = false;
        this.preloads = {};

        if (config.chromium_sandbox) {
            log.info('Chromium sandbox is enabled. Preload plugin is disabled.');
            return;
        }

        const dir_base = path.join(config.__DATA_DIR!, 'node_modules');
        for (const plugin of config.preload || []) {
            const plugin_path = path.join(dir_base, `mstdn-preload-${plugin}`);
            try {
                this.preloads[plugin_path] = r(plugin_path) as Plugin;
            } catch (e) {
                log.error(`Failed to load plugin ${plugin_path}:`, e);
            }
        }
    }

    loadAfterAppPrepared() {
        if (Object.keys(this.preloads).length === 0) {
            log.info('No preload plugin found. Skip loading');
            this.loaded = true;
            return;
        }

        return new Promise<void>(resolve => {
            // In order not to prevent application's initial loading, load preload plugins
            // on an idle callback.
            window.requestIdleCallback(() => {
                log.debug('Start loading preload plugins', this.config, this.account);
                if (this.tryLoading()) {
                    return resolve();
                }
                this.observeAppPrepared(this.tryLoading).then(resolve);
            });
        });
    }

    observeAppPrepared(callback: () => void) {
        // TODO:
        // Make an instance of MutationObserver to observe React root.
        return Promise.resolve(callback());
    }

    tryLoading = () => {
        if (document.querySelector('[data-react-class="Mastodon"]') === null) {
            log.info('Root element of react app was not found. App seems not to be loaded yet.');
            return false;
        }

        for (const key in this.preloads) {
            const f = this.preloads[key];
            try {
                f(this.config, this.account);
            } catch (e) {
                log.error(`Error while loading preload plugin '${key}':`, e);
            }
        }

        log.info('Preload plugins were loaded:', this.preloads);
        return true;
    }
}
