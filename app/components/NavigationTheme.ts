import Colors from "@/constants/Colors";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";

export function navigationTheme(colorScheme: 'light' | 'dark' | null | undefined) {
    const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
    const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
        ...base,
        colors: {
            ...base.colors,
            background: palette.background,
            card: palette.card,
            text: palette.text,
            primary: palette.tint,
            border: '#1E1E38',
        },
    };
}