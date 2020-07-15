import * as controller from 'hr.controller';
import * as loginPopup from 'hr.relogin.LoginPopup';
import * as safepost from 'hr.safepostmessage';
import * as iter from 'hr.iterable';
import * as di from 'hr.di';

export interface AppMenuItem {
    text: string;
    href: string;
}

export interface EntryPoint {
    data: any;
    refresh(): Promise<EntryPoint>;
    canRefresh(): boolean;
}

export abstract class AppMenuInjector<T extends EntryPoint> {
    public abstract createMenu(entry: T): Generator<AppMenuItem>;
    public abstract getEntryPoint(): Promise<T>;
}

export class AppMenu {
    public static get InjectorArgs(): controller.DiFunction<any>[] {
        return [controller.BindingCollection, safepost.PostMessageValidator, AppMenuInjector];
    }

    private userInfoView: controller.IView<any>;
    private menuItemsView: controller.IView<AppMenuItem>;
    private loggedInAreaToggle: controller.OnOffToggle;
    private entry: EntryPoint;

    constructor(bindings: controller.BindingCollection, private messageValidator: safepost.PostMessageValidator, private menuInjector: AppMenuInjector<EntryPoint>) {
        this.userInfoView = bindings.getView("userInfo");
        this.menuItemsView = bindings.getView("menuItems");
        this.loggedInAreaToggle = bindings.getToggle("loggedInArea");

        //Listen for relogin events
        window.addEventListener("message", e => { this.handleMessage(e); });

        this.setup();
    }

    private async setup(): Promise<void> {
        this.entry = await this.menuInjector.getEntryPoint();
        this.setMenu();
    }

    private async reloadMenu(): Promise<void> {
        if (this.entry && this.entry.canRefresh()) {
            this.entry = await this.entry.refresh();
            this.setMenu();
        }
    }

    private async setMenu(): Promise<void> {
        this.userInfoView.setData(this.entry.data);
        const menu = this.menuInjector.createMenu(this.entry);
        this.menuItemsView.setData(new iter.Iterable(menu));
        this.loggedInAreaToggle.mode = this.entry.data.isAuthenticated;
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