// Custom installer: legacy Toasts + dual showToast for older userplugins.
const ToastType = {
    MESSAGE: "message",
    SUCCESS: "success",
    FAILURE: "failure",
    CUSTOM: "custom",
    CLIP: "clip",
    LINK: "link",
    FORWARD: "forward",
    BOOKMARK: "bookmark",
    CLOCK: "clock"
};

const ToastPosition = {
    TOP: 0,
    BOTTOM: 1
};

const discordShowToast = findByCodeLazy(".currentToastMap.has(");

function customToastVariant(type?: string) {
    if (type === ToastType.SUCCESS || type === "success") return "success";
    if (type === ToastType.FAILURE || type === "failure" || type === "critical") return "critical";
    return "default";
}

function customToastPosition(pos?: number | string) {
    if (pos === ToastPosition.BOTTOM || pos === 1 || pos === "bottom") return "bottom";
    if (pos === ToastPosition.TOP || pos === 0 || pos === "top") return "top";
    return undefined;
}

export function createToast(message: string, type: string, options?: any) {
    return {
        message,
        id: Toasts.genId(),
        type,
        options
    };
}

export const Toasts = {
    Type: ToastType,
    Position: ToastPosition,
    genId: () => (Math.random() || Math.random()).toString(36).slice(2),
    create: createToast,
    show(data: any) {
        discordShowToast({
            text: data?.message ?? data?.text ?? "",
            variant: customToastVariant(data?.type ?? data?.variant),
            position: customToastPosition(data?.options?.position ?? data?.position),
            duration: data?.options?.duration ?? data?.duration,
            icon: data?.icon,
            iconColor: data?.iconColor
        });
    },
    pop() { /* no-op on new toast API */ }
};

export const showToast = ((messageOrData: any, type?: string, options?: any) => {
    if (messageOrData != null && typeof messageOrData === "object") {
        if ("text" in messageOrData) {
            return discordShowToast(messageOrData);
        }
        return Toasts.show(messageOrData);
    }
    Toasts.show(createToast(String(messageOrData ?? ""), type ?? ToastType.MESSAGE, options));
}) as any;
