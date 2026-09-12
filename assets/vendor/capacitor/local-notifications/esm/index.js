import { registerPlugin } from '../../core/dist/index.js';
const LocalNotifications = registerPlugin('LocalNotifications', {
    web: () => import('./web').then(m => new m.LocalNotificationsWeb()),
});
export * from './definitions';
export { LocalNotifications };
//# sourceMappingURL=index.js.map