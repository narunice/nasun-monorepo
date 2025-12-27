// const PulsePoint = () => {
//   return (
//     <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-10 h-10 flex items-center justify-center pointer-events-none">
//       <svg
//         className="absolute z-10 w-3 h-3 opacity-100 transition-opacity duration-500"
//         xmlns="http://www.w3.org/2000/svg"
//         viewBox="0 0 2.83 2.83"
//       >
//         <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
//       </svg>
//       <div
//         className="absolute rounded-full border border-gray-400 opacity-100 pulse-anim"
//         style={{
//           width: `2.5rem`,
//           height: `2.5rem`,
//           backgroundColor: "rgba(46, 172, 230, 0.2)",
//         }}
//       />
//     </div>
//   );
// };

// export default PulsePoint;

// PulsePoint.tsx
interface PulsePointProps {
  size?: number
  delay?: number
  duration?: number
}

const PulsePoint = ({ size = 2.5, delay = 0, duration = 3 }: PulsePointProps) => {
  return (
    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-10 h-10 flex items-center justify-center pointer-events-none">
      <svg
        className="absolute z-10 w-3 h-3 opacity-100 transition-opacity duration-500"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 2.83 2.83"
      >
        <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
      </svg>
      <div
        className="absolute rounded-full border border-gray-400 opacity-100 pulse-anim"
        style={{
          width: `${size}rem`,
          height: `${size}rem`,
          backgroundColor: "rgba(46, 172, 230, 0.2)",
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
        }}
      />
    </div>
  )
}

export default PulsePoint
