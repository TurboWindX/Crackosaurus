import moment from "moment";
import { useEffect, useState } from "react";

export interface RelativeTimeProps {
  time: moment.MomentInput;
}

export const RelativeTime = ({ time }: RelativeTimeProps) => {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(moment(time).fromNow());

    const interval = setInterval(() => {
      setValue(moment(time).fromNow());
    }, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [time]);

  return <span>{value}</span>;
};
