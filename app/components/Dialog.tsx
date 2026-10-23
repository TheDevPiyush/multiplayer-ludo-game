import { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog as PaperDialog, Portal } from 'react-native-paper';
import { Text } from './Themed';

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
            <PaperDialog visible={visible} onDismiss={onDismiss} dismissable={dismissable} style={styles.card}>
                <PaperDialog.Title>
                    <Text weight="bold" style={styles.title}>{title}</Text>
                </PaperDialog.Title>

                {(message || children) && (
                    <PaperDialog.Content>
                        {message ? <Text weight="medium" style={styles.message}>{message}</Text> : null}
                        {children}
                    </PaperDialog.Content>
                )}

                <PaperDialog.Actions style={styles.actions}>
                    {safeActions.map((action, i) => {
                        // The last action is the primary one (e.g. "Leave", "OK").
                        const primary = i === safeActions.length - 1;
                        return (
                            <Button
                                key={action.label}
                                mode={primary ? 'contained' : 'text'}
                                buttonColor={primary ? '#3B3BE8' : undefined}
                                textColor={primary ? '#FFFFFF' : '#3B3BE8'}
                                labelStyle={styles.buttonLabel}
                                style={styles.button}
                                onPress={action.onPress}
                                disabled={action.disabled}
                                loading={action.loading}
                            >
                                {action.label}
                            </Button>
                        );
                    })}
                </PaperDialog.Actions>
            </PaperDialog>
        </Portal>
    );
}

const styles = StyleSheet.create({
    card: { backgroundColor: '#FFFFFF', borderRadius: 24 },
    title: { fontSize: 20, color: '#1A1048' },
    message: { fontSize: 14, lineHeight: 20, color: '#5B5F7E' },
    actions: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
    button: { borderRadius: 14 },
    buttonLabel: { fontFamily: 'Hellix-Bold', fontSize: 14, marginHorizontal: 14 },
});
