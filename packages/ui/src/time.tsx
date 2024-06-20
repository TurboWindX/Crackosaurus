import moment from "moment";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export interface RelativeTimeProps {
  time: moment.MomentInput;
}

export const RelativeTime = ({ time }: RelativeTimeProps) => {
  const { i18n } = useTranslation();
  const [value, setValue] = useState("");

  const language = useMemo(() => i18n.language, [i18n]);

  useEffect(() => {
    moment.locale(language);
    setValue(moment(time?.toString()).fromNow());

    const interval = setInterval(() => {
      moment.locale(language);
      setValue(moment(time?.toString()).fromNow());
    }, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [time, language]);

  return <span>{value}</span>;
};
