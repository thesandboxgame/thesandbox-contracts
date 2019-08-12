pragma solidity ^0.5.2;

// works when no arguments required
// contract BaseImplementation {
//     constructor() public {
//         init();
//     }

//   function init() public {}
// }

// contract ProxyImplementation is BaseImplementation {

//   // allow sub class to initialse their specific phase:
//     mapping (string => bool) initialised;
//     modifier phase(string memory _phase) {
//         if(!initialised[_phase]) {
//             super.init();
//             initialised[_phase] = true;
//             _;
//         }
//     }
// }

contract ProxyImplementation {
    mapping(string => bool) initialised;

    modifier phase(string memory _phase) {
        if (!initialised[_phase]) {
            initialised[_phase] = true;
            _;
        }
    }
}
