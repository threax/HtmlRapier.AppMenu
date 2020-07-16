import * as controller from 'hr.controller';
import * as loginPopup from 'hr.relogin.LoginPopup';
import * as safepost from 'hr.safepostmessage';
import * as iter from 'hr.iterable';
import * as di from 'hr.di';
import * as tm from 'hr.accesstoken.manager';

export interface AppMenuItem {
    text: string;
    href: string;
}

export interface EntryPoint {
    refresh(): Promise<EntryPoint>;
    canRefresh(): boolean;
}

export interface UserInfo {
    userName: string;
}

export abstract class AppMenuInjector<T extends EntryPoint> {
    public abstract createMenu(entry: T): Generator<AppMenuItem>;
    public abstract getEntryPoint(): Promise<T>;
    public getUserData(accessToken: tm.AccessToken): Promise<UserInfo> {
        return Promise.resolve({
            userName: accessToken["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]
        });
    }
}

export class AppMenu {
    public static get InjectorArgs(): controller.DiFunction<any>[] {
        return [controller.BindingCollection, safepost.PostMessageValidator, AppMenuInjector, tm.TokenManager];
    }

    private userInfoView: controller.IView<any>;
    private menuItemsView: controller.IView<AppMenuItem>;
    private loggedInAreaToggle: controller.OnOffToggle;
    private entry: EntryPoint;

    constructor(bindings: controller.BindingCollection, private messageValidator: safepost.PostMessageValidator, private menuInjector: AppMenuInjector<EntryPoint>, private tokenManger: tm.TokenManager) {
        this.userInfoView = bindings.getView("userInfo");
        this.menuItemsView = bindings.getView("menuItems");
        this.loggedInAreaToggle = bindings.getToggle("loggedInArea");

        //Listen for relogin events
        window.addEventListener("message", e => { this.handleMessage(e); });

        this.setup();
    }

    private async setup(): Promise<void> {
        this.entry = await this.menuInjector.getEntryPoint();
        await this.setMenu();
    }

    private async reloadMenu(): Promise<void> {
        if (this.entry && this.entry.canRefresh()) {
            this.entry = await this.entry.refresh();
            await this.setMenu();
        }
    }

    private async setMenu(): Promise<void> {
        let accessToken = await this.tokenManger.getAccessToken();
        let userData = await this.menuInjector.getUserData(accessToken);
        this.userInfoView.setData(userData);
        const menu = this.menuInjector.createMenu(this.entry);
        this.menuItemsView.setData(new iter.Iterable(menu));
        this.loggedInAreaToggle.mode = accessToken !== null;
    }

    private handleMessage(e: MessageEvent): void {
        if (this.messageValidator.isValid(e)) {
            const message: loginPopup.ILoginMessage = e.data;
            if (message.type === loginPopup.MessageType && message.success) {
                this.reloadMenu();
            }
        }
    }
}

export function addServices<T extends EntryPoint>(services: controller.ServiceCollection, injectorType: di.ResolverFunction<AppMenuInjector<T>> | di.InjectableConstructor<AppMenuInjector<T>>) {
    services.tryAddShared(AppMenuInjector, injectorType);
    services.tryAddShared(AppMenu, AppMenu);
}