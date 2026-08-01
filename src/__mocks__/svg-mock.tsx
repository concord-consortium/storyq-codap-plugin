import React from "react";

// Stands in for CRA's svgr imports, which jest cannot parse.
export const ReactComponent = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />;

const svgMock = "svg-mock";
export default svgMock;
