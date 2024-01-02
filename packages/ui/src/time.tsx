import moment from "moment";
import { useEffect, useState } from "react";

export interface RelativeTimeProps {
  epoch: number;
};

export const RelativeTime = ({ epoch }: RelativeTimeProps) => {
  const [value, setValue] = useState("");
  
  useEffect(() => {
    setValue(moment(epoch).fromNow());
  }, [epoch]);

  return <span>{value}</span>
};
