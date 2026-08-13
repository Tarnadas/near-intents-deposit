import { FC, PropsWithChildren } from "react";
import {
  preloadDefaultResource,
  ExternalLocaleProvider,
  LocaleCode,
} from "@orderly.network/i18n";
import { LocaleMessages, TLocaleMessages } from "./module";

preloadDefaultResource(LocaleMessages);

const resources = (lang: LocaleCode) => {
  return import(`./locales/${lang}.json`).then(
    (res) => res.default as TLocaleMessages
  );
};

export const LocaleProvider: FC<PropsWithChildren> = (props) => {
  return (
    <ExternalLocaleProvider resources={resources}>
      {props.children}
    </ExternalLocaleProvider>
  );
};