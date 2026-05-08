import { ReactNode } from 'react';
import { Button, Dialog as PaperDialog, Paragraph, Portal } from 'react-native-paper';

type DialogAction = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
};

type AppDialogProps = {
    visible: boolean;
    title: string;
    message?: string;
    onDismiss: () => void;
    actions?: DialogAction[];
    children?: ReactNode;
    dismissable?: boolean;
};

export default function AppDialog({
    visible,
    title,
    message,
    onDismiss,
    actions,
    children,
    dismissable = true,
}: AppDialogProps) {
    const safeActions =
        actions && actions.length > 0
            ? actions
            : [{ label: 'OK', onPress: onDismiss }];

    return (
        <Portal>
            <PaperDialog visible={visible} onDismiss={onDismiss} dismissable={dismissable}>
                <PaperDialog.Title>{title}</PaperDialog.Title>

                {(message || children) && (
                    <PaperDialog.Content>
                        {message ? <Paragraph>{message}</Paragraph> : null}
                        {children}
                    </PaperDialog.Content>
                )}

                <PaperDialog.Actions>
                    {safeActions.map((action) => (
                        <Button
                            key={action.label}
                            onPress={action.onPress}
                            disabled={action.disabled}
                            loading={action.loading}
                        >
                            {action.label}
                        </Button>
                    ))}
                </PaperDialog.Actions>
            </PaperDialog>
        </Portal>
    );
}