import { COMPANY_HISTORY } from "../../constants/pageContent/companyHistory";

export default function CorporateHistory() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 md:px-8">
      <h2 className="px-2 mb-6 text-center">CORPORATE HISTORY</h2>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 md:left-1/2 h-full w-0.5 bg-gray-700 -translate-x-1/2"></div>

        {COMPANY_HISTORY.map((item, index) => (
          <div
            key={index}
            className={`relative mb-8 ${index % 2 === 0 ? "md:pr-[50%]" : "md:pl-[50%]"} ${
              index === COMPANY_HISTORY.length - 1 ? "pb-0" : ""
            }`}
          >
            {/* Dot */}
            <div className="absolute left-4 md:left-1/2 h-2 w-2 rounded-lg-full  bg-white -translate-x-1/2"></div>

            {/* Content */}
            <div className="px-0 md:px-4 ml-10 md:ml-0">
              <p className="text-sm font-medium text-gray-400 mb-1">{item.date}</p>
              <p className="text-base font-normal">{item.event}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
